import { describe, expect, it } from 'vitest';
import { makeCard, makeDeck } from '../../db/factories';
import type { Card, CardState } from '../../db/types';
import { buildInitialQueue, reinsertLearning } from './queue';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 86_400_000;

function card(state: CardState, due: number): Card {
  const c = makeCard({ deckId: 'd', front: 'f', back: 'b' });
  return { ...c, state, due };
}

describe('buildInitialQueue', () => {
  it('caps new and review cards by the daily limits', () => {
    const deck = makeDeck({ name: 'd', color: '#fff', newPerDay: 2, reviewsPerDay: 1 });
    const cards = [
      card('new', NOW),
      card('new', NOW),
      card('new', NOW),
      card('review', NOW - DAY),
      card('review', NOW - DAY),
      card('review', NOW - DAY),
    ];
    const q = buildInitialQueue({ deck, cards, newDone: 0, reviewsDone: 0, now: NOW });
    expect(q.filter((c) => c.state === 'new')).toHaveLength(2);
    expect(q.filter((c) => c.state === 'review')).toHaveLength(1);
  });

  it('respects work already done today against the caps', () => {
    const deck = makeDeck({ name: 'd', color: '#fff', newPerDay: 5, reviewsPerDay: 5 });
    const cards = [card('new', NOW), card('new', NOW), card('review', NOW - DAY)];
    const q = buildInitialQueue({ deck, cards, newDone: 5, reviewsDone: 5, now: NOW });
    expect(q).toHaveLength(0); // caps already exhausted
  });

  it('puts due learning/relearning cards first and ignores not-yet-due reviews', () => {
    const deck = makeDeck({ name: 'd', color: '#fff' });
    const cards = [
      card('review', NOW + DAY), // not due -> excluded
      card('learning', NOW - 1000),
      card('new', NOW),
    ];
    const q = buildInitialQueue({ deck, cards, newDone: 0, reviewsDone: 0, now: NOW });
    expect(q[0].state).toBe('learning');
    expect(q.some((c) => c.due === NOW + DAY)).toBe(false);
  });
});

describe('reinsertLearning', () => {
  it('re-inserts at slot 2 to recur later in the session', () => {
    const a = card('review', NOW);
    const b = card('new', NOW);
    const lapsed = card('learning', NOW + 60_000);
    const out = reinsertLearning([a, b], lapsed);
    expect(out).toEqual([a, b, lapsed]);
  });

  it('pushes to the end when fewer than two cards remain', () => {
    const a = card('review', NOW);
    const lapsed = card('learning', NOW + 60_000);
    expect(reinsertLearning([a], lapsed)).toEqual([a, lapsed]);
  });
});
