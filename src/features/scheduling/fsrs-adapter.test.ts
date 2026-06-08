import { describe, expect, it } from 'vitest';
import { makeCard } from '../../db/factories';
import { makeFsrsScheduler } from './fsrs-adapter';

const HOUR = 3_600_000;

describe('FSRS scheduler (long-term, enable_short_term: false)', () => {
  it('a new card rated "good" graduates to review with a multi-day future due in ONE pass', () => {
    const now = Date.now();
    const fresh = makeCard({ deckId: 'd1', front: 'a', back: 'b' });
    expect(fresh.state).toBe('new');

    const { card } = makeFsrsScheduler(0.9).apply(fresh, 'good', now, 1000);

    // Not a sub-day learning step: the due is well into the future (> today)...
    expect(card.due - now).toBeGreaterThan(12 * HOUR);
    expect(card.fsrs.scheduledDays).toBeGreaterThanOrEqual(1);
    // ...and it left the learning states, so the session queue drops it
    // (useReviewSession only reinserts learning/relearning cards).
    expect(card.state).toBe('review');
  });

  it('"again" schedules sooner than "good" (lower grades come back earlier)', () => {
    const now = Date.now();
    const sched = makeFsrsScheduler(0.9);
    const again = sched.apply(makeCard({ deckId: 'd1', front: 'a', back: 'b' }), 'again', now, 1000).card;
    const good = sched.apply(makeCard({ deckId: 'd1', front: 'a', back: 'b' }), 'good', now, 1000).card;
    expect(again.due).toBeLessThan(good.due);
  });
});
