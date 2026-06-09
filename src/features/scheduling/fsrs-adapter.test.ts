import { describe, expect, it } from 'vitest';
import { makeCard } from '../../db/factories';
import { makeFsrsScheduler } from './fsrs-adapter';

const HOUR = 3_600_000;

describe('FSRS scheduler (short-term steps: lapses relearn in-session)', () => {
  it('a new card rated "good" still graduates to review with a multi-day due in ONE pass', () => {
    const now = Date.now();
    const fresh = makeCard({ deckId: 'd1', front: 'a', back: 'b' });
    expect(fresh.state).toBe('new');

    const { card } = makeFsrsScheduler(0.9).apply(fresh, 'good', now, 1000);

    // A single learning step means "Good" skips the intraday step and graduates...
    expect(card.due - now).toBeGreaterThan(12 * HOUR);
    expect(card.fsrs.scheduledDays).toBeGreaterThanOrEqual(1);
    // ...leaving the learning states, so the session queue drops it (it only
    // reinserts learning/relearning cards) — no in-session looping.
    expect(card.state).toBe('review');
  });

  it('"again" schedules sooner than "good" (lower grades come back earlier)', () => {
    const now = Date.now();
    const sched = makeFsrsScheduler(0.9);
    const again = sched.apply(makeCard({ deckId: 'd1', front: 'a', back: 'b' }), 'again', now, 1000).card;
    const good = sched.apply(makeCard({ deckId: 'd1', front: 'a', back: 'b' }), 'good', now, 1000).card;
    expect(again.due).toBeLessThan(good.due);
  });

  it('failing a graduated card relearns it THIS session: sub-day step, learning state', () => {
    const now = Date.now();
    const sched = makeFsrsScheduler(0.9);
    // Graduate a card to review, then fail it.
    const review = sched.apply(makeCard({ deckId: 'd1', front: 'a', back: 'b' }), 'easy', now, 1000).card;
    expect(review.state).toBe('review');

    const lapsed = sched.apply(review, 'again', now, 1000).card;
    // Comes back inside the session (queue reinserts learning/relearning)...
    expect(lapsed.state === 'relearning' || lapsed.state === 'learning').toBe(true);
    // ...within minutes, NOT a full day out (the old "too loose" behavior).
    expect(lapsed.due - now).toBeLessThan(12 * HOUR);
  });

  it('the "Errei" preview is labeled in minutes, not days', () => {
    const now = Date.now();
    const sched = makeFsrsScheduler(0.9);
    const review = sched.apply(makeCard({ deckId: 'd1', front: 'a', back: 'b' }), 'easy', now, 1000).card;
    const preview = sched.preview(review, now);
    expect(preview.again.intervalLabel).toMatch(/min/);
  });
});
