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
import { clearQueryCache, invalidate } from '../../db/store';
import { pruneForeignDrafts } from '../../lib/drafts';
import { DEFAULT_PLAN } from '../usage/limits';
import type { Plan } from '../usage/limits';
import { PRIVACY_POLICY_VERSION } from '../../config';

/** Extra signup-only data: optional phone + the marketing-consent choice. The
 *  privacy-policy acceptance is REQUIRED by the form (signup is blocked without
 *  it), so it is always sent and is not part of this object. */
export interface SignUpOptions {
  phone?: string;
  marketingConsent: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** profiles.display_name → metadata → email local-part → "Estudante". */
  displayName: string;
  /** profiles.plan (free | basic | advanced). Defaults to free until loaded. */
  plan: Plan;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    opts?: SignUpOptions,
  ) => Promise<void>;
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
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
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
    // Form drafts live in (per-browser) IndexedDB. On login / account switch, drop
    // every draft that isn't this user's — so a previous account's in-progress work
    // never lingers on a shared browser. The per-user key scoping already prevents
    // it from being SURFACED; this prevents stale accumulation. (Skipped on logout
    // so the same user gets their own draft back when they sign back in.)
    if (uid) void pruneForeignDrafts(uid);
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

  // Load the profile display name + plan whenever the signed-in user changes.
  useEffect(() => {
    if (!user) {
      setProfileName(null);
      setPlan(DEFAULT_PLAN);
      return;
    }
    let active = true;
    void (async () => {
      // Read the profile (name + plan) FIRST so the UI reflects it after a single
      // round-trip — apply_pending_plan no longer blocks it.
      const { data } = await supabase
        .from('profiles')
        .select('display_name, plan')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      setProfileName((data?.display_name as string | null) ?? null);
      const p = (data?.plan as string | null) ?? null;
      setPlan(p === 'basic' || p === 'advanced' ? p : DEFAULT_PLAN);

      // Off the critical path: reconcile a plan that was paid for before this
      // account existed (parked in pending_plans by the Kiwify webhook). It runs
      // AFTER the read above, so it never delays showing the profile/plan. Still
      // runs on every authenticated load/login, so existing users' pending plans
      // are applied as before — just not blocking. Tamper-proof: it takes no plan
      // argument and only applies what the service role recorded as paid for this
      // user's own email. If it applied a paid plan (returns it), reflect that.
      try {
        const { data: applied } = await supabase.rpc('apply_pending_plan');
        if (active && (applied === 'basic' || applied === 'advanced')) {
          setPlan(applied);
        }
      } catch {
        /* nothing pending or a transient error */
      }

      // Also off the critical path: link friend invites that were sent to this
      // user's email BEFORE the account existed (stored with addressee_id NULL).
      // Safe + idempotent on every login (new signup OR existing user): no
      // spoofable argument — it matches on auth.uid() + the user's own email. If
      // it linked anything, refresh the invites query so they show up in
      // "Convites recebidos" without a manual reload.
      try {
        const { data: linked } = await supabase.rpc('apply_pending_friend_invites');
        if (active && typeof linked === 'number' && linked > 0) invalidate();
      } catch {
        /* nothing pending or a transient error */
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const signUp = useCallback(
    async (email: string, password: string, name: string, opts?: SignUpOptions) => {
      const trimmed = name.trim();
      const phone = opts?.phone?.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // Pass the display name + LGPD consent as user metadata. The DB trigger
        // that creates the profiles row reads these from raw_user_meta_data and
        // persists them (display_name, phone, privacy_consent_*, marketing_consent),
        // so we must NOT PATCH/insert profiles here — doing it before the new
        // session's token is established 401s ("permission denied"). Any later
        // profile write goes through the data layer, which UPDATEs the existing row.
        // Phone is included only when non-empty (it is optional).
        options: {
          data: {
            display_name: trimmed,
            ...(phone ? { phone } : {}),
            privacy_consent: true,
            privacy_consent_version: PRIVACY_POLICY_VERSION,
            privacy_consent_at: new Date().toISOString(),
            marketing_consent: opts?.marketingConsent ?? false,
          },
        },
      });
      if (error) throw new Error(mapAuthError(error.message));

      if (!data.session) {
        // signUp succeeded but returned no session (e.g. e-mail confirmation
        // required). Be explicit instead of the generic error.
        throw new Error('Conta criada! Confirme seu e-mail para entrar.');
      }

      // Valid session in hand: reflect the name instantly and route into the app
      // (onAuthStateChange also fires; setting it here makes routing immediate).
      // New accounts always start on the free plan.
      setProfileName(trimmed);
      setPlan(DEFAULT_PLAN);
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
      plan,
      signUp,
      signIn,
      signOut,
      recovery,
      resetPassword,
      updatePassword,
    }),
    [user, loading, displayName, plan, signUp, signIn, signOut, recovery, resetPassword, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
