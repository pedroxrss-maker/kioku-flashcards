/**
 * Auth screens: "Entrar" and "Criar conta" as two toggles on one page, styled
 * to match the rounded study-dashboard look (Fraunces title, Manrope body,
 * accent primary button). Also exports the branded loading + config-notice
 * states used while gating the app.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';
import brandLogo from '../../../neurofluency-logo-branca.png';

type Mode = 'signin' | 'signup';

function BrandLockup({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <img src={brandLogo} alt="" draggable={false} style={{ height: size, width: 'auto' }} />
      <span className="display" style={{ fontSize: size * 0.86, fontWeight: 600 }}>
        Kioku
      </span>
    </div>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return active
    ? { background: 'var(--accent)', color: '#fff' }
    : { color: 'var(--muted)' };
}

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  // Tab is driven by the URL: /entrar?mode=signup opens "Criar conta",
  // /entrar (or ?mode=login) opens "Entrar".
  const [searchParams] = useSearchParams();
  const paramMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<Mode>(paramMode);
  useEffect(() => {
    setMode(paramMode);
  }, [paramMode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const mail = email.trim();
    if (!mail || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    if (isSignup && !displayName.trim()) {
      setError('Informe um nome de exibição.');
      return;
    }
    if (isSignup && password.length < 6) {
      setError('A senha precisa de ao menos 6 caracteres');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        await signUp(mail, password, displayName);
      } else {
        await signIn(mail, password);
      }
      // On success the session updates and the gate swaps this page for the app.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 py-10"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-[420px] rise">
        <div className="text-center mb-6">
          <BrandLockup size={34} />
          <p className="text-muted text-sm mt-3">Seu estudo com repetição espaçada.</p>
        </div>

        <div className="surface p-6 md:p-7">
          {/* Tabs */}
          <div
            className="flex gap-1 p-1 mb-5"
            style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-full)' }}
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              onClick={() => switchMode('signin')}
              className="flex-1 py-2 text-sm font-semibold transition-colors"
              style={{ borderRadius: 'var(--r-full)', ...tabStyle(!isSignup) }}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              onClick={() => switchMode('signup')}
              className="flex-1 py-2 text-sm font-semibold transition-colors"
              style={{ borderRadius: 'var(--r-full)', ...tabStyle(isSignup) }}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {isSignup && (
              <div>
                <label className="field-label" htmlFor="auth-name">
                  Nome de exibição
                </label>
                <input
                  id="auth-name"
                  className="field"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como devemos te chamar?"
                />
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="auth-email">
                E-mail
              </label>
              <input
                id="auth-email"
                className="field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="auth-password">
                Senha
              </label>
              <input
                id="auth-password"
                className="field"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              {isSignup && (
                <p className="text-xs text-muted mt-1.5">Mínimo de 6 caracteres.</p>
              )}
            </div>

            {error && (
              <p className="text-sm" style={{ color: 'var(--accent)' }} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-accent w-full"
              disabled={submitting}
              style={{ marginTop: 4 }}
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {isSignup ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <p className="text-sm text-muted text-center mt-5">
            {isSignup ? 'Já tem uma conta?' : 'Ainda não tem conta?'}{' '}
            <button
              type="button"
              className="font-semibold"
              style={{ color: 'var(--accent)' }}
              onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
            >
              {isSignup ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Branded full-screen loader shown while the session is resolving. */
export function AuthLoading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--bg)' }}
    >
      <BrandLockup size={30} />
      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--accent)' }} />
    </div>
  );
}

/** Shown when the Supabase env vars are missing so login can't work. */
export function SupabaseConfigNotice() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: 'var(--bg)' }}
    >
      <div className="surface p-7 max-w-[460px] text-center rise">
        <div className="mb-4">
          <BrandLockup size={28} />
        </div>
        <h1 className="display mb-2" style={{ fontSize: 20 }}>
          Configuração necessária
        </h1>
        <p className="text-muted text-sm">
          Defina <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no arquivo{' '}
          <b>.env.local</b> e reinicie o servidor para ativar o login.
        </p>
      </div>
    </div>
  );
}
