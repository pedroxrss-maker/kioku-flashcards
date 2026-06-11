import { UNLIMITED_PER_DAY } from '../../db/types';
import type { Card, Deck } from '../../db/types';

/** Fisher–Yates shuffle (copy). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface BuildQueueParams {
  deck: Deck;
  cards: Card[];
  newDone: number;
  reviewsDone: number;
  now: number;
}

/**
 * Build the initial review queue (section 4):
 * - learning/relearning due intraday come first (ungated by daily caps),
 * - then due reviews (gated by reviewsPerDay − reviewsDone),
 * - then new cards (gated by newPerDay − newDone),
 * with light shuffling within each group so the deck never feels mechanical.
 */
export function buildInitialQueue({
  deck,
  cards,
  newDone,
  reviewsDone,
  now,
}: BuildQueueParams): Card[] {
  const learning = cards.filter(
    (c) => (c.state === 'learning' || c.state === 'relearning') && c.due <= now,
  );
  const dueReviews = cards.filter((c) => c.state === 'review' && c.due <= now);
  const news = cards.filter((c) => c.state === 'new');

  // "Automáticas": deliver every due review the scheduler surfaced, no ceiling.
  const reviewCap =
    deck.reviewsPerDay >= UNLIMITED_PER_DAY ? Infinity : Math.max(0, deck.reviewsPerDay - reviewsDone);
  const newCap =
    deck.newPerDay >= UNLIMITED_PER_DAY ? Infinity : Math.max(0, deck.newPerDay - newDone);

  const pickedReviews = shuffle(dueReviews).slice(0, reviewCap);
  // New cards keep their insertion order (so a deck is learned top-to-bottom),
  // but the cap is applied first.
  const pickedNew = news.slice(0, newCap);

  return [...shuffle(learning), ...pickedReviews, ...pickedNew];
}

/**
 * Re-insert a still-learning card a couple of slots back so it recurs later in
 * the same session (in-session learning steps, no real-time waiting).
 */
export function reinsertLearning(rest: Card[], card: Card): Card[] {
  const pos = Math.min(rest.length, 2);
  return [...rest.slice(0, pos), card, ...rest.slice(pos)];
}
