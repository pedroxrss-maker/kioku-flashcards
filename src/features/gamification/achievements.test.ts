import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  computeMetrics,
} from './achievements';
import type { AchievementMetrics } from './achievements';
import { defaultSettings, makeCard, makeDeck } from '../../db/factories';
import type { Card, ReviewLog } from '../../db/types';

const base: AchievementMetrics = {
  totalReviews: 0,
  cardCount: 0,
  deckCount: 0,
  longest: 0,
  studyDays: 0,
  mastered: 0,
  studiedToday: 0,
  dailyGoal: 40,
  daysGoalMet: 0,
  hasAudio: false,
  hasImage: false,
};
const find = (key: string) => ACHIEVEMENTS.find((a) => a.key === key)!;

describe('achievement registry', () => {
  it('is exactly the lean 19, with unique keys and known categories', () => {
    expect(ACHIEVEMENTS).toHaveLength(19);
    const keys = ACHIEVEMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(19);
    for (const a of ACHIEVEMENTS) {
      expect(CATEGORY_ORDER).toContain(a.category);
      expect(CATEGORY_LABELS[a.category]).toBeTruthy();
    }
  });
});

describe('achievement criteria', () => {
  it('review milestones fire exactly at the threshold', () => {
    expect(find('reviews_100').check({ ...base, totalReviews: 99 })).toBe(false);
    expect(find('reviews_100').check({ ...base, totalReviews: 100 })).toBe(true);
    expect(find('reviews_10000').check({ ...base, totalReviews: 10000 })).toBe(true);
  });
  it('daily goal needs a positive goal that is actually met', () => {
    expect(find('goal_today').check({ ...base, dailyGoal: 0, studiedToday: 99 })).toBe(false);
    expect(find('goal_today').check({ ...base, dailyGoal: 40, studiedToday: 39 })).toBe(false);
    expect(find('goal_today').check({ ...base, dailyGoal: 40, studiedToday: 40 })).toBe(true);
  });
  it('streaks read the longest-ever value (so a break never un-earns)', () => {
    expect(find('streak_7').check({ ...base, longest: 6 })).toBe(false);
    expect(find('streak_7').check({ ...base, longest: 7 })).toBe(true);
  });
  it('feature unlocks read the boolean flags', () => {
    expect(find('feat_image').check({ ...base, hasImage: true })).toBe(true);
    expect(find('feat_audio').check({ ...base, hasAudio: false })).toBe(false);
    expect(find('feat_audio').check({ ...base, hasAudio: true })).toBe(true);
  });
});

describe('computeMetrics', () => {
  it('derives counts, mastery and media flags from persisted data', () => {
    const deck = makeDeck({ name: 'D', color: '#fff', algorithm: 'sm2' });
    const seed = makeCard({ deckId: deck.id, front: 'a', back: 'b' });
    const mature: Card = { ...seed, state: 'review', sm2: { ...seed.sm2, intervalDays: 30 } };
    const withImg = makeCard({ deckId: deck.id, front: '<img src="x.png">', back: 'b' });
    const withAudio: Card = { ...makeCard({ deckId: deck.id, front: 'q', back: 'a' }), audioPath: 'u/d/x.mp3' };
    const cards = [mature, withImg, withAudio];
    const logs: ReviewLog[] = [0, 1, 2].map((i) => ({
      id: `l${i}`,
      cardId: mature.id,
      deckId: deck.id,
      rating: 'good',
      reviewedAt: Date.now(),
      durationMs: 1000,
      prevState: 'review',
      scheduledDays: 1,
    }));

    const m = computeMetrics({ logs, cards, decks: [deck], settings: defaultSettings() });
    expect(m.totalReviews).toBe(3);
    expect(m.cardCount).toBe(3);
    expect(m.deckCount).toBe(1);
    expect(m.mastered).toBe(1); // only the review-state card with interval >= 21d
    expect(m.hasImage).toBe(true);
    expect(m.hasAudio).toBe(true);
  });
});
