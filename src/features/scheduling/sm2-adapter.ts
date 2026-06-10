import type { Card, Rating, ReviewLog } from '../../db/types';
import { uuid } from '../../lib/uuid';

export interface Sm2Config {
  learningStepsMin: number[]; // [1, 10]
  relearningStepsMin: number[]; // [10]
  graduatingIntervalDays: number; // 1
  easyIntervalDays: number; // 4
  startingEase: number; // 2.5
  minEase: number; // 1.3
  easyBonus: number; // 1.3
  hardMultiplier: number; // 1.2
  intervalModifier: number; // 1.0
  lapseNewIntervalPct: number; // 0.0  (Anki "new interval" on lapse)
  minLapseIntervalDays: number; // 1
  maximumIntervalDays: number; // 36500
  leechThreshold: number; // 8
  enableFuzz: boolean; // true
}

export const DEFAULT_SM2: Sm2Config = {
  // A SINGLE learning step so "Good" graduates a new card in one pass (to a
  // 1-day Review interval) instead of re-showing it intraday. Multiple steps
  // made the session queue reinsert each new card again and again — matching
  // the FSRS adapter's `enable_short_term: false` fix.
  learningStepsMin: [1],
  relearningStepsMin: [10],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  startingEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardMultiplier: 1.2,
  intervalModifier: 1.0,
  lapseNewIntervalPct: 0.0,
  minLapseIntervalDays: 1,
  maximumIntervalDays: 36500,
  leechThreshold: 8,
  enableFuzz: true,
};

const DAY = 86_400_000;
const MIN = 60_000;

const clampEase = (e: number, c: Sm2Config) => Math.max(c.minEase, e);
const capDays = (d: number, c: Sm2Config) =>
  Math.min(c.maximumIntervalDays, Math.max(1, Math.round(d)));

function fuzzed(days: number, c: Sm2Config): number {
  if (!c.enableFuzz || days < 2.5) return Math.round(days);
  const pct = days < 7 ? 0.25 : days < 30 ? 0.15 : 0.05;
  const delta = Math.max(1, Math.round(days * pct));
  return Math.round(days - delta + Math.random() * (2 * delta));
}

export function labelInterval(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24 * 60))} min`;
  if (days < 30) return `${Math.round(days)} d`;
  if (days < 365) return `${Math.round(days / 30)} m`;
  const y = days / 365;
  return `${y < 2 ? y.toFixed(1) : Math.round(y)} a`;
}

// Core transition. applyFuzz=false is used for button previews (deterministic),
// applyFuzz=true on the actual commit.
function transition(
  card: Card,
  rating: Rating,
  now: number,
  c: Sm2Config,
  applyFuzz: boolean,
): Card {
  const s = { ...card.sm2 };
  let state = card.state;
  let due = now;

  const scheduleDays = (d: number) => {
    const final = applyFuzz ? fuzzed(d, c) : Math.round(d);
    due = now + capDays(final, c) * DAY;
  };

  if (state === 'new' || state === 'learning') {
    const steps = c.learningStepsMin;
    if (rating === 'again') {
      s.step = 0;
      state = 'learning';
      due = now + steps[0] * MIN;
    } else if (rating === 'hard') {
      state = 'learning';
      due = now + steps[Math.min(s.step, steps.length - 1)] * MIN;
    } else if (rating === 'good') {
      if (s.step + 1 >= steps.length) {
        state = 'review';
        s.ease = card.sm2.ease || c.startingEase;
        s.intervalDays = c.graduatingIntervalDays;
        s.reps += 1;
        s.step = 0;
        scheduleDays(s.intervalDays);
      } else {
        s.step += 1;
        state = 'learning';
        due = now + steps[s.step] * MIN;
      }
    } else {
      // easy
      state = 'review';
      s.ease = card.sm2.ease || c.startingEase;
      s.intervalDays = c.easyIntervalDays;
      s.reps += 1;
      s.step = 0;
      scheduleDays(s.intervalDays);
    }
  } else if (state === 'review') {
    s.reps += 1;
    if (rating === 'again') {
      s.lapses += 1;
      s.ease = clampEase(s.ease - 0.2, c);
      s.isLeech = s.lapses >= c.leechThreshold;
      s.intervalDays = Math.max(
        c.minLapseIntervalDays,
        Math.round(s.intervalDays * c.lapseNewIntervalPct),
      );
      s.step = 0;
      state = 'relearning';
      due = now + c.relearningStepsMin[0] * MIN;
    } else if (rating === 'hard') {
      s.ease = clampEase(s.ease - 0.15, c);
      s.intervalDays = capDays(
        s.intervalDays * c.hardMultiplier * c.intervalModifier,
        c,
      );
      scheduleDays(s.intervalDays);
    } else if (rating === 'good') {
      s.intervalDays = capDays(s.intervalDays * s.ease * c.intervalModifier, c);
      scheduleDays(s.intervalDays);
    } else {
      // easy
      s.ease = clampEase(s.ease + 0.15, c);
      s.intervalDays = capDays(
        s.intervalDays * s.ease * c.easyBonus * c.intervalModifier,
        c,
      );
      scheduleDays(s.intervalDays);
    }
  } else {
    // relearning
    const steps = c.relearningStepsMin;
    if (rating === 'again') {
      s.step = 0;
      due = now + steps[0] * MIN;
    } else if (rating === 'hard') {
      due = now + steps[Math.min(s.step, steps.length - 1)] * MIN;
    } else if (rating === 'good') {
      if (s.step + 1 >= steps.length) {
        state = 'review';
        s.step = 0;
        s.intervalDays = Math.max(c.minLapseIntervalDays, s.intervalDays);
        scheduleDays(s.intervalDays);
      } else {
        s.step += 1;
        due = now + steps[s.step] * MIN;
      }
    } else {
      // easy
      state = 'review';
      s.step = 0;
      s.intervalDays = Math.max(c.minLapseIntervalDays, s.intervalDays) + 1;
      scheduleDays(s.intervalDays);
    }
  }

  return { ...card, state, due, updatedAt: Date.now(), sm2: s };
}

export function makeSm2Scheduler(config: Sm2Config = DEFAULT_SM2) {
  return {
    preview(card: Card, now: number) {
      const out = {} as Record<Rating, { card: Card; intervalLabel: string }>;
      (['again', 'hard', 'good', 'easy'] as Rating[]).forEach((r) => {
        const next = transition(card, r, now, config, false);
        const days = (next.due - now) / DAY;
        out[r] = { card: next, intervalLabel: labelInterval(days) };
      });
      return out;
    },
    apply(card: Card, rating: Rating, now: number, durationMs: number) {
      const updated = transition(card, rating, now, config, true);
      const log: ReviewLog = {
        id: uuid(),
        cardId: card.id,
        deckId: card.deckId,
        rating,
        reviewedAt: now,
        durationMs,
        prevState: card.state,
        scheduledDays: Math.round((updated.due - now) / DAY),
      };
      return { card: updated, log };
    },
  };
}
