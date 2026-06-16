/**
 * Auth screens: "Entrar" and "Criar conta" as two toggles on one page, styled
 * to match the rounded study-dashboard look (Fraunces title, Manrope body,
 * accent primary button). Also exports the branded loading + config-notice
 * states used while gating the app.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';
import { SIGNUPS_ENABLED } from '../../config';
import brandLogo from '../../../neurofluency-logo-branca.png';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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

export function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const reduce = useReducedMotion();
  // Tab is driven by the URL: /entrar?mode=signup opens "Criar conta",
  // /entrar (or ?mode=login) opens "Entrar". When signups are disabled we ignore
  // ?mode=signup and only ever show the login form.
  const [searchParams] = useSearchParams();
  const paramMode: Mode =
    SIGNUPS_ENABLED && searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<Mode>(paramMode);
  useEffect(() => {
    setMode(paramMode);
  }, [paramMode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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

  async function onForgotSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const mail = email.trim();
    if (!mail) {
      setError('Informe seu e-mail.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(mail);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
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
          <AnimatePresence mode="wait" initial={false}>
          {forgot ? (
            <motion.div
              key="forgot-view"
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : 6 }}
              transition={{ duration: reduce ? 0 : 0.16, ease: EASE }}
              className="flex flex-col"
            >
              <h2 className="display mb-1" style={{ fontSize: 18 }}>
                Redefinir senha
              </h2>
              <p className="text-sm text-muted mb-4">
                Enviaremos um link para você criar uma nova senha.
              </p>
              {resetSent ? (
                <p className="text-sm mb-2" style={{ color: 'var(--accent-green)' }}>
                  Link enviado para <b>{email.trim()}</b>. Verifique seu e-mail (e a caixa de spam).
                </p>
              ) : (
                <form onSubmit={onForgotSubmit} className="flex flex-col" noValidate>
                  <div style={{ marginBottom: 16 }}>
                    <label className="field-label" htmlFor="forgot-email">
                      E-mail
                    </label>
                    <input
                      id="forgot-email"
                      className="field"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@exemplo.com"
                    />
                  </div>
                  {error && (
                    <p
                      className="text-sm"
                      style={{ color: 'var(--accent)', marginBottom: 16 }}
                      role="alert"
                    >
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
                    Enviar link de redefinição
                  </button>
                </form>
              )}
              <button
                type="button"
                className="text-sm text-muted text-center mt-5 hover:text-fg transition-colors"
                onClick={() => {
                  setForgot(false);
                  setResetSent(false);
                  setError(null);
                }}
              >
                ← Voltar ao login
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="auth-view"
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : 6 }}
              transition={{ duration: reduce ? 0 : 0.16, ease: EASE }}
            >
          {/* Tabs (login + signup): the accent pill slides between options. Hidden
              entirely when signups are disabled, leaving only the login form. */}
          {SIGNUPS_ENABLED && (
          <div
            className="flex gap-1 p-1 mb-5"
            style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-full)' }}
            role="tablist"
          >
            {(['signin', 'signup'] as Mode[]).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchMode(m)}
                  className="relative flex-1 py-2 text-sm font-semibold"
                  style={{
                    borderRadius: 'var(--r-full)',
                    background: 'transparent',
                    color: active ? '#fff' : 'var(--muted)',
                    transition: 'color 0.25s ease',
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="authTabPill"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                      style={{ position: 'absolute', inset: 0, background: 'var(--accent)', borderRadius: 'var(--r-full)', zIndex: 0 }}
                    />
                  )}
                  <span style={{ position: 'relative', zIndex: 1 }}>
                    {m === 'signin' ? 'Entrar' : 'Criar conta'}
                  </span>
                </button>
              );
            })}
          </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col" noValidate>
            {/* Signup-only name field: smoothly expands/collapses on toggle.
                Its 16px spacing lives inside the animated box so nothing jumps. */}
            <AnimatePresence initial={false}>
              {isSignup && (
                <motion.div
                  key="name-field"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ marginBottom: 16 }}>
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
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ marginBottom: 16 }}>
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

            <div style={{ marginBottom: 16 }}>
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
              <AnimatePresence initial={false}>
                {isSignup && (
                  <motion.p
                    key="pw-hint"
                    className="text-xs text-muted"
                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                    animate={{ height: 'auto', opacity: 1, marginTop: 6 }}
                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                    transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                    style={{ overflow: 'hidden' }}
                  >
                    Mínimo de 6 caracteres.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {!isSignup && (
              <button
                type="button"
                onClick={() => {
                  setForgot(true);
                  setError(null);
                }}
                className="self-end text-xs text-muted hover:text-fg transition-colors"
                style={{ marginTop: -6, marginBottom: 14 }}
              >
                Esqueceu a senha?
              </button>
            )}

            {error && (
              <p className="text-sm" style={{ color: 'var(--accent)', marginBottom: 16 }} role="alert">
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

          {SIGNUPS_ENABLED ? (
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
          ) : (
            <p className="text-xs text-muted text-center mt-5">
              Cadastros temporariamente fechados.
            </p>
          )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Shown when a password-recovery link is opened: set a new password, which then
 *  signs the user in with it (recovery state clears and the app loads). */
export function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 6) {
      setError('A senha precisa de ao menos 6 caracteres');
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
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
          <p className="text-muted text-sm mt-3">Defina uma nova senha.</p>
        </div>
        <div className="surface p-6 md:p-7">
          <h2 className="display mb-4" style={{ fontSize: 18 }}>
            Nova senha
          </h2>
          <form onSubmit={onSubmit} className="flex flex-col" noValidate>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" htmlFor="new-password">
                Nova senha
              </label>
              <input
                id="new-password"
                className="field"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <p className="text-xs text-muted" style={{ marginTop: 6 }}>
                Mínimo de 6 caracteres.
              </p>
            </div>
            {error && (
              <p className="text-sm" style={{ color: 'var(--accent)', marginBottom: 16 }} role="alert">
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
              Salvar nova senha
            </button>
          </form>
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
