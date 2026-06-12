/**
 * Auth context backed by Supabase (email + password only).
 *
 * Tracks the current session via getSession() + onAuthStateChange and exposes
 * { user, loading, displayName, signUp, signIn, signOut }. The display name is
 * resolved from the `profiles` row, falling back to sign-up metadata, then the
 * email local-part, then "Estudante".
 *
 * This layer only handles authentication + the profile name; data lives in
 * Supabase (see db/supabaseRepo). Nothing here touches the schedulers.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { clearQueryCache } from '../../db/store';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** profiles.display_name → metadata → email local-part → "Estudante". */
  displayName: string;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** A password-recovery link was opened; show the "set new password" screen. */
  recovery: boolean;
  /** Send a password-reset email with a link back to the app. */
  resetPassword: (email: string) => Promise<void>;
  /** Set a new password for the (recovery-authenticated) user. */
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Map a Supabase auth error message to a friendly pt-BR string. */
function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha inválidos';
  if (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('user already exists')
  ) {
    return 'Este e-mail já está cadastrado';
  }
  if (m.includes('password should be at least') || (m.includes('password') && m.includes('6'))) {
    return 'A senha precisa de ao menos 6 caracteres';
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'E-mail inválido';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar';
  }
  return 'Algo deu errado. Tente novamente.';
}

function resolveDisplayName(profileName: string | null, user: User | null): string {
  const fromProfile = profileName?.trim();
  if (fromProfile) return fromProfile;
  const meta = user?.user_metadata as { display_name?: string } | undefined;
  const fromMeta = meta?.display_name?.trim();
  if (fromMeta) return fromMeta;
  const email = user?.email;
  if (email && email.includes('@')) {
    const local = email.split('@')[0].trim();
    if (local) return local;
  }
  return 'Estudante';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  const user = session?.user ?? null;

  // Drop cached query data whenever the account changes (incl. sign-out), so a
  // user never briefly sees another account's rows from the shared cache.
  const prevUidRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const uid = user?.id ?? null;
    if (prevUidRef.current !== undefined && prevUidRef.current !== uid) {
      clearQueryCache();
    }
    prevUidRef.current = uid;
  }, [user?.id]);

  // Resolve the initial session, then subscribe to changes.
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Opening the reset-password email link signs the user in with a recovery
      // session; flag it so the app shows the "set new password" screen instead.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load the profile display name whenever the signed-in user changes.
  useEffect(() => {
    if (!user) {
      setProfileName(null);
      return;
    }
    let active = true;
    void supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfileName((data?.display_name as string | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const trimmed = name.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // Pass the display name as user metadata. The DB trigger that creates
        // the profiles row reads this and persists display_name at creation
        // time, so we must NOT PATCH/insert profiles here — doing it before the
        // new session's token is established 401s ("permission denied"). Any
        // later profile write goes through the data layer, which only runs with
        // a confirmed session and UPDATEs the existing row.
        options: { data: { display_name: trimmed } },
      });
      if (error) throw new Error(mapAuthError(error.message));

      if (!data.session) {
        // signUp succeeded but returned no session (e.g. e-mail confirmation
        // required). Be explicit instead of the generic error.
        throw new Error('Conta criada! Confirme seu e-mail para entrar.');
      }

      // Valid session in hand: reflect the name instantly and route into the app
      // (onAuthStateChange also fires; setting it here makes routing immediate).
      setProfileName(trimmed);
      setSession(data.session);
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(mapAuthError(error.message));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/entrar`,
    });
    if (error) throw new Error(mapAuthError(error.message));
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(mapAuthError(error.message));
    setRecovery(false);
  }, []);

  const displayName = useMemo(
    () => resolveDisplayName(profileName, user),
    [profileName, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      displayName,
      signUp,
      signIn,
      signOut,
      recovery,
      resetPassword,
      updatePassword,
    }),
    [user, loading, displayName, signUp, signIn, signOut, recovery, resetPassword, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
