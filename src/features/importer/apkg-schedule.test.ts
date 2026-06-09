import { describe, expect, it } from 'vitest';
import { mapScheduling } from './apkg-import';

const DAY = 86_400_000;

/**
 * Locks in how Anki scheduling (cards-table row) maps onto Kioku fields. The
 * importer picks a deck's algorithm from whether `fsrs` came back set, so these
 * cases also pin down the "classic SM-2 deck stays SM-2" decision that keeps an
 * imported review schedule intact.
 */
describe('mapScheduling (Anki -> Kioku card scheduling)', () => {
  const colCrt = Date.UTC(2024, 0, 1); // collection creation day (ms)
  const now = colCrt + 100 * DAY; // "import time"

  it('maps a classic SM-2 review card to sm2 fields with NO FSRS state', () => {
    // type 2 = review; due is a day-number from col.crt; ivl in days; factor 2500.
    const s = mapScheduling(2, 2, 110, 30, 2500, 12, 1, '', colCrt, now);
    expect(s.state).toBe('review');
    expect(s.due).toBe(colCrt + 110 * DAY);
    expect(s.sm2.intervalDays).toBe(30);
    expect(s.sm2.ease).toBeCloseTo(2.5);
    expect(s.sm2.reps).toBe(12);
    expect(s.sm2.lapses).toBe(1);
    // No FSRS memory state in a classic SM-2 collection -> deck imports as SM-2.
    expect(s.fsrs).toBeUndefined();
  });

  it('imports FSRS memory state and back-dates lastReview to due - interval', () => {
    const data = JSON.stringify({ s: 45.6, d: 6.1 });
    const s = mapScheduling(2, 2, 110, 30, 0, 8, 0, data, colCrt, now);
    expect(s.state).toBe('review');
    expect(s.fsrs).toBeDefined();
    expect(s.fsrs?.stability).toBeCloseTo(45.6);
    expect(s.fsrs?.difficulty).toBeCloseTo(6.1);
    expect(s.fsrs?.scheduledDays).toBe(30);
    // Last review = due - interval, NOT "now": otherwise FSRS sees ~0 elapsed
    // days for an overdue card and collapses the next interval.
    expect(s.fsrs?.lastReview).toBe(colCrt + 110 * DAY - 30 * DAY);
  });

  it('treats suspended/buried (queue < 0) cards as inactive new', () => {
    const s = mapScheduling(2, -1, 110, 30, 2500, 5, 0, '', colCrt, now);
    expect(s.state).toBe('new');
  });

  it('maps a brand-new card to due-now with no FSRS state', () => {
    const s = mapScheduling(0, 0, 0, 0, 0, 0, 0, '', colCrt, now);
    expect(s.state).toBe('new');
    expect(s.due).toBe(now);
    expect(s.fsrs).toBeUndefined();
  });

  it('reads a learning card whose due is an epoch-seconds timestamp', () => {
    const dueEpochSec = Math.floor((now + 10 * 60_000) / 1000); // 10 min out
    const s = mapScheduling(1, 1, dueEpochSec, 0, 0, 1, 0, '', colCrt, now);
    expect(s.state).toBe('learning');
    expect(s.due).toBe(dueEpochSec * 1000);
  });
});
