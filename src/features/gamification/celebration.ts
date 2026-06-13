/**
 * Celebration store — a tiny module-level store (same shape as toast.ts) that
 * drives the full-width <CelebrationBanner />. Any feature shows a celebration
 * by calling celebrate(...): level-ups and achievement unlocks both use it.
 *
 * It is a FIFO QUEUE: celebrations show one at a time, in order. The banner
 * always renders the head; dismissing the head (auto after a timeout, or by tap)
 * advances to the next. This keeps a burst of unlocks from overwriting each
 * other — they play in sequence. Consumed via useSyncExternalStore.
 */

export type CelebrationKind = 'levelup' | 'achievement';

export interface Celebration {
  id: number;
  kind: CelebrationKind;
  title: string;
  message: string;
}

let queue: Celebration[] = [];
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

/** The celebration currently on screen (head of the queue), or null. The same
 *  reference is returned while it is unchanged, so useSyncExternalStore is happy. */
export function getCelebration(): Celebration | null {
  return queue.length > 0 ? queue[0] : null;
}

/** Enqueue a celebration. Returns its id. */
export function celebrate(c: Omit<Celebration, 'id'>): number {
  seq += 1;
  queue = [...queue, { id: seq, ...c }];
  emit();
  return seq;
}

/** Dismiss the head celebration and advance to the next. With an `id`, only
 *  dismisses when it is still the head (so a stale timer can't drop a newer one). */
export function dismissCelebration(id?: number): void {
  if (queue.length === 0) return;
  if (id != null && queue[0].id !== id) return;
  queue = queue.slice(1);
  emit();
}
