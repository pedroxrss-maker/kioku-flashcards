/**
 * Service-worker registration + SAFE, DEFERRED auto-update.
 *
 * The SW (vite-plugin-pwa, 'autoUpdate' + workbox.skipWaiting/clientsClaim) is
 * generated so a newly deployed worker activates IMMEDIATELY and claims the open
 * page — that's good (no tab ever stays stuck on a stale worker) and we KEEP it.
 *
 * What changed: activating the new worker (background) is now SEPARATE from
 * reloading the page (visible). We no longer reload the instant `controllerchange`
 * fires — that could cut off whatever the user is doing, e.g. a long .apkg import
 * (reproduced: a 35k-file import was killed mid-way by the auto-reload). Instead,
 * when a new version takes over we mark the update PENDING and apply it only at a
 * SAFE boundary:
 *   - the next SPA route navigation, or the tab regaining focus after being away;
 *   - and NEVER while a critical op holds the busy guard (lib/appBusy → an import
 *     sets it for its whole duration). If the tab is hidden when the update lands,
 *     reloading is invisible, so we do it right away (still gated by the guard).
 * A single guarded reload (never loops). A small toast announces the pending
 * update so it's predictable rather than a silent refresh.
 *
 * Page navigations are network-first (vite.config workbox), so a normal load
 * already serves the freshest index.html → newest bundles; this just makes an
 * ALREADY-OPEN browser pick up a new deploy on its own, safely.
 */
import { pushToast } from '../../lib/toast';
import { isAppBusy } from '../../lib/appBusy';

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export function registerPwaUpdates(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // the SW only ships in the production build
  window.addEventListener('load', () => {
    void register();
  });
}

async function register(): Promise<void> {
  let updatePending = false;
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;

  // Apply a pending update ONLY when it's safe: nothing pending → no-op; already
  // reloaded → no-op (one-shot, can't loop); a critical op in progress → wait.
  const safeReload = () => {
    if (!updatePending || reloaded) return;
    if (isAppBusy()) return; // never interrupt an import or other busy operation
    reloaded = true;
    window.location.reload();
  };

  // A new worker took control (skipWaiting/clientsClaim already activated it in
  // the background). DON'T reload now — just mark it pending and announce it; the
  // visible reload happens at the next safe boundary below. Reloading immediately
  // is fine ONLY when the tab is hidden (invisible to the user), still guarded.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updatePending || reloaded) return; // first install: already latest
    updatePending = true;
    pushToast('info', 'Nova versão pronta — será aplicada em instantes.', 8000);
    if (document.visibilityState === 'hidden') safeReload();
  });

  // Safe boundaries to apply the deferred update: a route navigation (SPA
  // pushState or back/forward), or the tab regaining focus after being away.
  window.addEventListener('popstate', safeReload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') safeReload();
  });
  // react-router navigations go through history.pushState — patch it to also fire
  // a safe-reload check (the original behaviour is preserved and called first).
  const origPushState = history.pushState;
  history.pushState = function (
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    origPushState.call(this, data, unused, url);
    safeReload();
  } as History['pushState'];

  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch {
    return; // no SW available — the app still works, just without offline/auto-update
  }

  // Long-open sessions (e.g. an installed standalone window kept open for days):
  // poll for a new deploy. When found, the new worker installs, self-activates
  // (skipWaiting) and claims the page → controllerchange → the deferred flow above.
  window.setInterval(() => {
    reg.update().catch(() => {});
  }, UPDATE_CHECK_INTERVAL);
}
