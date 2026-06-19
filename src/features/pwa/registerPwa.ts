/**
 * Service-worker registration + FORCED auto-update.
 *
 * The SW (vite-plugin-pwa, 'autoUpdate' mode) is generated with skipWaiting +
 * clientsClaim, so a newly deployed worker activates IMMEDIATELY — it does not
 * wait for every tab to close — and takes control of the open page. That fires a
 * `controllerchange`, and we reload exactly once into the new build. No banner,
 * no button: a returning browser can never get stuck on a stale version.
 *
 * Page navigations are also network-first (see vite.config workbox), so a normal
 * load already serves the freshest index.html → newest hashed bundles; this just
 * guarantees an ALREADY-OPEN browser picks up a new deploy on its own.
 *
 * We register ourselves (injectRegister is off) with updateViaCache:'none' so
 * /sw.js is never served stale, and poll hourly to cover long-open standalone
 * sessions.
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
  // On a RETURNING visit the page is already controlled by the old worker; when a
  // new deploy's worker takes over, controllerchange fires and we reload once into
  // it. Skip the very first install (no prior controller) — the page is already
  // running the latest, nothing to refresh — and guard against a reload loop
  // (controllerchange can fire more than once).
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });

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
  // (skipWaiting) and claims the page → controllerchange → the reload above.
  window.setInterval(() => {
    reg.update().catch(() => {});
  }, UPDATE_CHECK_INTERVAL);
}
