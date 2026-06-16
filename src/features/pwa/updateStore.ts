/**
 * Tiny bridge between the service-worker update flow (registerPwa.ts, which runs
 * OUTSIDE React) and the in-app soft auto-updater (<PwaAutoUpdate>, a React
 * component). When a new SW is installed and waiting, registerPwa stores the
 * "apply" callback here (it posts SKIP_WAITING); PwaAutoUpdate reads it and fires
 * it at the next SAFE moment (route change / refocus, never mid-review).
 *
 * There is intentionally NO subscription/notify here and NO UI: the user is never
 * prompted. The value is read on demand, only when a safe moment occurs.
 */
let pendingApply: (() => void) | null = null;

/** Record that a new version is installed and waiting. `apply` triggers
 *  skip-waiting on the waiting worker (which leads to controllerchange + reload). */
export function setPendingUpdate(apply: () => void): void {
  pendingApply = apply;
}

/** The pending apply callback, or null when no update is waiting. */
export function getPendingUpdate(): (() => void) | null {
  return pendingApply;
}
