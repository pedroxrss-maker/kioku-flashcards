import { describe, expect, it } from 'vitest';
import { makeCard } from '../../db/factories';
import type { Card } from '../../db/types';
import { DEFAULT_SM2, makeSm2Scheduler } from './sm2-adapter';
import { makeFsrsScheduler } from './fsrs-adapter';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function reviewCard(overrides: Partial<Card['sm2']>): Card {
  const c = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });
  return {
    ...c,
    state: 'review',
    sm2: { ...c.sm2, ...overrides },
  };
}

describe('SM-2 adapter', () => {
  const sched = makeSm2Scheduler(DEFAULT_SM2);

  it('a new card rated good steps 1m -> 10m -> graduates to review @ 1 day (Anki two steps)', () => {
    const fresh = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });

    // First good: advance to the SECOND learning step (10m), STILL learning, so
    // the card re-shows within the same session before it graduates.
    const step2 = sched.apply(fresh, 'good', NOW, 1000).card;
    expect(step2.state).toBe('learning');
    expect(step2.sm2.step).toBe(1);
    expect(step2.due - NOW).toBe(10 * 60_000); // 10 minutes

    // Second good: graduate to review @ the 1-day graduating interval.
    const out = sched.apply(step2, 'good', NOW, 1000).card;
    expect(out.state).toBe('review');
    expect(out.sm2.intervalDays).toBe(1);
  });

  it('a new card rated again returns to the first step; two goods then graduate it', () => {
    const fresh = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });
    const lapsed = sched.apply(fresh, 'again', NOW, 1000).card;
    expect(lapsed.state).toBe('learning');
    expect(lapsed.sm2.step).toBe(0);
    expect(lapsed.due - NOW).toBe(1 * 60_000); // back to the 1m first step

    const step2 = sched.apply(lapsed, 'good', NOW, 1000).card;
    expect(step2.state).toBe('learning'); // advanced to the 10m step
    const graduated = sched.apply(step2, 'good', NOW, 1000).card;
    expect(graduated.state).toBe('review');
  });

  it('a fresh card rated easy jumps straight to review @ interval 4', () => {
    const fresh = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });
    const out = sched.apply(fresh, 'easy', NOW, 1000).card;
    expect(out.state).toBe('review');
    expect(out.sm2.intervalDays).toBe(4);
  });

  it('hard on a new card (first step) waits the average of the first two steps (~6 min)', () => {
    const fresh = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });
    // (1m + 10m) / 2 = 5.5m, labeled "6 min"; Hard never advances the step.
    expect(sched.preview(fresh, NOW).hard.intervalLabel).toBe('6 min');
    const out = sched.apply(fresh, 'hard', NOW, 1000).card;
    expect(out.state).toBe('learning');
    expect(out.sm2.step).toBe(0);
    expect(out.due - NOW).toBe(5.5 * 60_000);
  });

  it('hard on a later learning step repeats that step (10 min)', () => {
    const fresh = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });
    const step2 = sched.apply(fresh, 'good', NOW, 1000).card; // now on the 10m step
    expect(step2.sm2.step).toBe(1);
    const out = sched.apply(step2, 'hard', NOW, 1000).card;
    expect(out.state).toBe('learning');
    expect(out.sm2.step).toBe(1);
    expect(out.due - NOW).toBe(10 * 60_000);
  });

  it('a review card rated again increments lapses, drops ease by 0.20, relearns', () => {
    const card = reviewCard({ ease: 2.5, intervalDays: 10, reps: 5, lapses: 0 });
    const out = sched.apply(card, 'again', NOW, 1000).card;
    expect(out.state).toBe('relearning');
    expect(out.sm2.lapses).toBe(1);
    expect(out.sm2.ease).toBeCloseTo(2.3, 5);
  });

  it('ease is floored at 1.3 on lapse', () => {
    const card = reviewCard({ ease: 1.4, intervalDays: 10, reps: 5, lapses: 2 });
    const out = sched.apply(card, 'again', NOW, 1000).card;
    expect(out.sm2.ease).toBeCloseTo(1.3, 5);
  });

  it('a review card rated good produces interval ~= oldInterval * ease (deterministic preview)', () => {
    const card = reviewCard({ ease: 2.5, intervalDays: 10, reps: 5, lapses: 0 });
    const preview = sched.preview(card, NOW);
    // 10 * 2.5 * 1.0 = 25, no fuzz in preview.
    expect(preview.good.card.sm2.intervalDays).toBe(25);
    expect(preview.good.intervalLabel).toBe('25 d');
  });
});

describe('FSRS adapter', () => {
  const sched = makeFsrsScheduler(0.9);

  it('preview returns four outcomes with non-decreasing scheduled days again->easy', () => {
    const fresh = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });
    const p = sched.preview(fresh, NOW);
    const again = p.again.card.fsrs.scheduledDays;
    const hard = p.hard.card.fsrs.scheduledDays;
    const good = p.good.card.fsrs.scheduledDays;
    const easy = p.easy.card.fsrs.scheduledDays;
    expect(again).toBeLessThanOrEqual(hard);
    expect(hard).toBeLessThanOrEqual(good);
    expect(good).toBeLessThanOrEqual(easy);
  });

  it('apply(good) advances due into the future and writes stability/difficulty', () => {
    const fresh = makeCard({ deckId: 'deck-1', front: 'a', back: 'b' });
    const { card, log } = sched.apply(fresh, 'good', NOW, 1500);
    expect(card.due).toBeGreaterThan(NOW);
    expect(card.fsrs.stability).toBeGreaterThan(0);
    expect(card.fsrs.difficulty).toBeGreaterThan(0);
    expect(log.rating).toBe('good');
    expect(log.prevState).toBe('new');
  });
});
