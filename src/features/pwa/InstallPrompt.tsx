import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

/**
 * Self-contained "install the PWA" invite. Two paths:
 *   - Android/Chrome: captures the `beforeinstallprompt` event and offers a real
 *     "Instalar" button that triggers the native install dialog.
 *   - iOS/Safari: no programmatic install exists, so it shows the manual
 *     share-sheet instruction instead.
 * Never shown when already running standalone, or for 14 days after a dismissal.
 * Pure React + the Kioku design tokens — no new deps. Mount it once near the app
 * root; it renders nothing until an install path is actually available.
 */

/** The non-standard event Chromium fires before showing its install banner. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'kioku-install-dismissed';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000; // re-invite only after 14 days

/** Window holder for the install prompt captured early in main.tsx. */
type InstallHolder = { __kiokuInstallPrompt: BeforeInstallPromptEvent | null };

/** The prompt main.tsx may have stashed before this component mounted (or null). */
function getCapturedPrompt(): BeforeInstallPromptEvent | null {
  return (window as unknown as InstallHolder).__kiokuInstallPrompt ?? null;
}

/** Drop the captured prompt after it's been used (single-use event). */
function clearCapturedPrompt(): void {
  (window as unknown as InstallHolder).__kiokuInstallPrompt = null;
}

/** Already installed? Both the standard media query and the iOS-only flag. */
function isStandalone(): boolean {
  const mq =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

/** iOS device running actual Safari (not Chrome/Firefox/Edge for iOS). */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua);
  if (!iOS) return false;
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, OPiOS = Opera (all on iOS).
  return /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}

/** Was the banner dismissed within the last 14 days? localStorage is best-effort. */
function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/** Stamp the dismissal time so we stay quiet for 14 days. Best-effort. */
function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode / blocked: just don't persist (banner reappears next load) */
  }
}

export default function InstallPrompt() {
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dbg, setDbg] = useState<string>(''); // TEMP on-screen diagnostic

  useEffect(() => {
    // TEMP on-screen diagnostic: surface the decision inputs on mobile (no console).
    const info = {
      standalone: isStandalone(),
      dismissedRecently: dismissedRecently(),
      isIosSafari: isIosSafari(),
      hasCapturedPrompt: !!getCapturedPrompt(),
    };
    setDbg(JSON.stringify(info));

    // Never invite when already installed or recently dismissed.
    if (isStandalone() || dismissedRecently()) return;

    const showAndroid = (e: BeforeInstallPromptEvent) => {
      setDeferred(e);
      setMode('android');
      setVisible(true);
    };
    // The prompt Chrome may have fired BEFORE this component mounted (captured in
    // main.tsx). Use it right away so the banner isn't missed on a timing race.
    const preCaptured = getCapturedPrompt();
    if (preCaptured) showAndroid(preCaptured);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep Chrome's default mini-infobar from showing
      showAndroid(e as BeforeInstallPromptEvent);
    };
    // main.tsx re-broadcasts the captured event via this custom event.
    const onAvailable = () => {
      const captured = getCapturedPrompt();
      if (captured) showAndroid(captured);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('kioku-install-available', onAvailable);
    window.addEventListener('appinstalled', onInstalled);

    // iOS Safari never fires beforeinstallprompt — surface the manual steps.
    if (isIosSafari()) {
      setMode('ios');
      setVisible(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('kioku-install-available', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    markDismissed();
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice; // 'accepted' | 'dismissed' — either way we're done
    setDeferred(null);
    clearCapturedPrompt(); // single-use: drop the early-captured event too
    setVisible(false);
  };

  // TEMP on-screen diagnostic box — ALWAYS rendered (even when the banner is
  // hidden), so the decision inputs are visible on mobile without a console.
  const debugBox = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#000',
        color: '#bef264',
        fontSize: '11px',
        padding: '6px',
        wordBreak: 'break-all',
      }}
    >
      {dbg + ' | ' + navigator.userAgent}
    </div>
  );

  const banner =
    !visible || mode === null ? null : (
      <div
        className="fixed inset-x-0 bottom-0 z-50"
        style={{ padding: '12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-label="Instalar o Kioku"
      >
      <div className="mx-auto w-full" style={{ maxWidth: 520 }}>
        <div
          className="flex items-start gap-3 p-4"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <div className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }}>
            {mode === 'android' ? <Download size={22} /> : <Share size={22} />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm" style={{ color: 'var(--fg)' }}>
              Instalar o Kioku
            </p>

            {mode === 'android' ? (
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Adicione o Kioku à tela inicial para estudar mais rápido, mesmo offline.
              </p>
            ) : (
              <p
                className="text-xs mt-1 flex flex-wrap items-center gap-x-1"
                style={{ color: 'var(--muted)' }}
              >
                Toque em
                <Share size={14} aria-hidden style={{ color: 'var(--accent)' }} />
                e depois em “Adicionar à Tela de Início”.
              </p>
            )}

            {mode === 'android' && (
              <button type="button" onClick={install} className="btn btn-accent btn-sm mt-3">
                <Download size={16} /> Instalar
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Fechar"
            className="shrink-0 -mr-1 -mt-1 p-1 rounded-full"
            style={{ color: 'var(--muted)' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
    );

  return (
    <>
      {debugBox}
      {banner}
    </>
  );
}
