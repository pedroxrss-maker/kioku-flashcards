import type { Card, Deck } from '../db/types';

/** Days an interval must reach for a card to count as "mastered" (mature). */
export const MATURE_DAYS = 21;

/** Group a flat card list by deckId. */
export function groupCardsByDeck(cards: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const c of cards) {
    const arr = map.get(c.deckId);
    if (arr) arr.push(c);
    else map.set(c.deckId, [c]);
  }
  return map;
}

export interface DeckCounts {
  total: number;
  newCount: number;
  learning: number;
  review: number;
  /** Cards whose `due` has arrived (ungated raw count). */
  due: number;
  /** Mature review cards. */
  mastered: number;
}

/** Effective scheduled interval in days, regardless of algorithm. */
export function effectiveIntervalDays(card: Card, deck?: Deck): number {
  if (deck) {
    return deck.algorithm === 'fsrs'
      ? card.fsrs.scheduledDays
      : card.sm2.intervalDays;
  }
  // Unknown algorithm: take whichever is set.
  return Math.max(card.sm2.intervalDays, card.fsrs.scheduledDays);
}

export interface CardStateCounts {
  new: number;
  learning: number;
  relearning: number;
  young: number;
  mature: number;
  total: number;
}

/**
 * Anki-style breakdown of cards by scheduling state. Review cards split into
 * young vs mature at MATURE_DAYS, using the deck's own algorithm interval — so
 * it mirrors exactly how the user's SM-2/FSRS history has classified each card.
 */
export function countCardStates(cards: Card[], deckById: Map<string, Deck>): CardStateCounts {
  const out: CardStateCounts = { new: 0, learning: 0, relearning: 0, young: 0, mature: 0, total: cards.length };
  for (const c of cards) {
    if (c.state === 'new') out.new += 1;
    else if (c.state === 'learning') out.learning += 1;
    else if (c.state === 'relearning') out.relearning += 1;
    else if (effectiveIntervalDays(c, deckById.get(c.deckId)) >= MATURE_DAYS) out.mature += 1;
    else out.young += 1;
  }
  return out;
}

export function countCards(
  cards: Card[],
  now: number = Date.now(),
  deck?: Deck,
): DeckCounts {
  const counts: DeckCounts = {
    total: cards.length,
    newCount: 0,
    learning: 0,
    review: 0,
    due: 0,
    mastered: 0,
  };
  for (const c of cards) {
    if (c.state === 'new') counts.newCount += 1;
    else if (c.state === 'learning' || c.state === 'relearning')
      counts.learning += 1;
    else if (c.state === 'review') {
      counts.review += 1;
      if (effectiveIntervalDays(c, deck) >= MATURE_DAYS) counts.mastered += 1;
    }
    if (c.due <= now) counts.due += 1;
  }
  return counts;
}
