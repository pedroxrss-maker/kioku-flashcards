import { setUpdateAvailable } from './updateStore';

/**
 * Service-worker registration + manual update prompt.
 *
 * The SW (vite-plugin-pwa, 'prompt' mode) serves page navigations NETWORK-FIRST,
 * so a normal reload already fetches the newest index.html → newest hashed
 * bundles, with no hard refresh. This module additionally:
 *  - registers with updateViaCache:'none' so /sw.js is never served stale,
 *  - polls for a new deploy hourly (covers long-open standalone PWA sessions),
 *  - when a new SW is installed and waiting, surfaces a non-intrusive prompt
 *    (it never forces a reload); the user taps "Atualizar" → we post SKIP_WAITING
 *    → the new SW activates → controllerchange reloads into the new version.
 *
 * We register ourselves (vite-plugin-pwa injectRegister is off) to control all of
 * the above precisely.
 */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export function registerPwaUpdates(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // the SW only ships in the production build
  window.addEventListener('load', () => {
    void register();
  });
}

async function register(): Promise<void> {
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch {
    return; // no SW available — the app still works, just without offline/prompt
  }

  // Reload once the (user-approved) new SW takes control. Guarded against loops.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  const offerUpdate = (worker: ServiceWorker | null) => {
    if (!worker) return;
    setUpdateAvailable(() => worker.postMessage({ type: 'SKIP_WAITING' }));
  };

  // A new SW may already be waiting (installed on a previous visit).
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

  // A new SW that finishes installing while the page is open.
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // 'installed' WITH an existing controller = an update (not the first install
      // on a fresh visit, which shouldn't prompt).
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        offerUpdate(reg.waiting ?? installing);
      }
    });
  });

  // Long-open sessions: poll for a new deploy.
  window.setInterval(() => {
    reg.update().catch(() => {});
  }, UPDATE_CHECK_INTERVAL);
}
