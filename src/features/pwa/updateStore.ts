/**
 * Tiny external store (same shape as toast.ts) bridging the service-worker
 * update flow to React. registerPwa.ts calls setUpdateAvailable(apply) when a
 * new version is installed and waiting; <UpdateBanner> subscribes and shows the
 * "nova versão disponível" prompt. `apply` performs skip-waiting + reload.
 */
let applyFn: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The apply callback (skip-waiting + reload), or null when no update is ready. */
export function getUpdateApply(): (() => void) | null {
  return applyFn;
}

export function setUpdateAvailable(apply: () => void): void {
  applyFn = apply;
  emit();
}
