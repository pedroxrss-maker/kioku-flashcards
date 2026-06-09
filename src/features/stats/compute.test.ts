import { describe, expect, it } from 'vitest';
import type { Deck, Rating, ReviewLog } from '../../db/types';
import { dailyPerformance, progressStats, sessionsFromLogs, statsSummary } from './compute';

let seq = 0;
function log(deckId: string, reviewedAt: number, rating: Rating, durationMs = 1000): ReviewLog {
  seq += 1;
  return {
    id: `l${seq}`,
    cardId: `c${seq}`,
    deckId,
    rating,
    reviewedAt,
    durationMs,
    prevState: 'review',
    scheduledDays: 1,
  };
}

const deck = (id: string): Deck => ({
  id,
  name: `Deck ${id}`,
  color: '#fff',
  algorithm: 'fsrs',
  createdAt: 0,
  newPerDay: 20,
  reviewsPerDay: 200,
  desiredRetention: 0.9,
  buttonCount: 4,
  ttsLang: 'en-US',
});

describe('stats compute', () => {
  it('statsSummary counts accuracy as non-again over total', () => {
    const now = Date.now();
    const logs = [
      log('a', now, 'good'),
      log('a', now, 'again'),
      log('a', now, 'easy'),
      log('a', now, 'hard'),
    ];
    const s = statsSummary(logs);
    expect(s.totalReviews).toBe(4);
    expect(s.accuracyPct).toBe(75); // 3 of 4 non-again
  });

  it('dailyPerformance returns exactly `days` buckets ending today', () => {
    const data = dailyPerformance([], 14);
    expect(data).toHaveLength(14);
    expect(data.every((d) => d.total === 0)).toBe(true);
  });

  it('progressStats totals the window and buckets today', () => {
    const now = Date.now();
    const logs = [
      log('a', now, 'good', 1000),
      log('a', now, 'easy', 2000),
      log('b', now, 'again', 3000),
    ];
    const s = progressStats(logs, 7);
    expect(s.points).toHaveLength(7);
    expect(s.reviewed).toBe(3);
    expect(s.accuracyPct).toBe(67); // 2 of 3 good/easy
    expect(s.decks).toBe(2);
    expect(s.timeMs).toBe(6000);
    expect(s.points[s.points.length - 1].value).toBe(3); // all landed today
  });

  it('sessionsFromLogs splits on deck change and >30min gaps', () => {
    const base = Date.UTC(2026, 0, 10, 9, 0, 0);
    const min = 60_000;
    const logs = [
      log('a', base, 'good'),
      log('a', base + 2 * min, 'again'),
      // 40min gap -> new session, same deck
      log('a', base + 42 * min, 'good'),
      // different deck -> new session
      log('b', base + 43 * min, 'good'),
    ];
    const sessions = sessionsFromLogs(logs, [deck('a'), deck('b')], 10);
    expect(sessions).toHaveLength(3);
    // most recent first
    expect(sessions[0].deckId).toBe('b');
    // first session had 2 cards, 1 again -> 50%
    const firstA = sessions.find((s) => s.deckId === 'a' && s.count === 2);
    expect(firstA?.scorePct).toBe(50);
  });
});
