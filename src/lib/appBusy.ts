/**
 * Tiny global "app busy" guard. Long / critical operations (e.g. a big .apkg
 * import) hold it so the DEFERRED service-worker update reload (see
 * features/pwa/registerPwa) can never interrupt them. The busy state is also
 * mirrored to `window.__kiokuBusy` so it's visible in DevTools and can be forced
 * on manually for testing the update flow.
 */

declare global {
  interface Window {
    /** True while a critical op runs. Mirrors the internal count; can also be set
     *  by hand to force the deferred SW reload to wait (manual / test override). */
    __kiokuBusy?: boolean;
  }
}

let busyCount = 0;
const clearListeners = new Set<() => void>();

function sync(): void {
  if (typeof window !== 'undefined') window.__kiokuBusy = busyCount > 0;
}

/**
 * Mark a critical operation as running. Returns a release function — call it once
 * (in a `finally`, so success, error AND cancel all release). Reentrant: nested
 * or parallel operations are counted, and busy only clears when the last ends.
 */
export function beginAppBusy(): () => void {
  busyCount += 1;
  sync();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busyCount = Math.max(0, busyCount - 1);
    sync();
    if (busyCount === 0) for (const l of clearListeners) l();
  };
}

/**
 * True while any critical op is running OR `window.__kiokuBusy` was forced on.
 * The deferred SW reload must wait until this is false.
 */
export function isAppBusy(): boolean {
  if (typeof window !== 'undefined' && window.__kiokuBusy === true) return true;
  return busyCount > 0;
}

/** Notified when the programmatic busy count returns to zero (best-effort hook). */
export function onAppBusyClear(listener: () => void): () => void {
  clearListeners.add(listener);
  return () => clearListeners.delete(listener);
}
