/**
 * Celebration store — a tiny module-level store (same shape as toast.ts) that
 * drives the full-width <CelebrationBanner />. Any feature triggers a
 * celebration by calling celebrate(...); level-ups do it now, achievements will
 * reuse it in Phase 2. Only ONE celebration is shown at a time (a new one
 * replaces the current), consumed via useSyncExternalStore.
 */

export type CelebrationKind = 'levelup' | 'achievement';

export interface Celebration {
  id: number;
  kind: CelebrationKind;
  title: string;
  message: string;
}

let current: Celebration | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeCelebration(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCelebration(): Celebration | null {
  return current;
}

/** Show a celebration (replacing any current one). Returns its id. */
export function celebrate(c: Omit<Celebration, 'id'>): number {
  seq += 1;
  current = { id: seq, ...c };
  emit();
  return seq;
}

/** Dismiss the current celebration (no-op if `id` isn't the active one). */
export function dismissCelebration(id?: number): void {
  if (id != null && current?.id !== id) return;
  if (!current) return;
  current = null;
  emit();
}
