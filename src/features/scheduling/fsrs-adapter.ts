import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State as FsrsState,
  type Card as FsrsCard,
} from 'ts-fsrs';
import type { Card, CardState, Rating, ReviewLog } from '../../db/types';
import { labelInterval } from './sm2-adapter';
import { uuid } from '../../lib/uuid';

const DAY = 86_400_000;

// `as const` keeps each value as its literal enum member so the union narrows to
// ts-fsrs's `Grade` (Rating minus Manual), which `repeat`/`next` require.
const RATING = {
  again: FsrsRating.Again, // 1
  hard: FsrsRating.Hard, // 2
  good: FsrsRating.Good, // 3
  easy: FsrsRating.Easy, // 4
} as const;

const STATE_TO_KIOKU: Record<FsrsState, CardState> = {
  [FsrsState.New]: 'new',
  [FsrsState.Learning]: 'learning',
  [FsrsState.Review]: 'review',
  [FsrsState.Relearning]: 'relearning',
};
const STATE_FROM_KIOKU: Record<CardState, FsrsState> = {
  new: FsrsState.New,
  learning: FsrsState.Learning,
  review: FsrsState.Review,
  relearning: FsrsState.Relearning,
};

function buildScheduler(desiredRetention: number) {
  return fsrs(
    generatorParameters({
      request_retention: desiredRetention, // e.g. 0.9
      maximum_interval: 36500,
      enable_fuzz: true,
      // Short-term steps ON so a LAPSE actually relearns. "Errei" drops the card
      // into a ~10 min step (state learning/relearning) and the session queue
      // reinserts it until it's answered correctly — instead of the old
      // long-term mode that pushed a failed card a full day out (way too loose).
      enable_short_term: true,
      // A SINGLE learning step is the crux: with the default two-step list
      // ["1m","10m"], "Good" only advances one step, so new cards looped in the
      // session forever and only "Easy" graduated. With one step, "Good"/"Fácil"
      // graduate straight to a multi-day Review in ONE pass, while "Errei"/
      // "Difícil" still get a short in-session step.
      learning_steps: ['10m'],
      relearning_steps: ['10m'],
    }),
  );
}

// Kioku Card -> ts-fsrs FsrsCard
function toFsrs(card: Card, now: number): FsrsCard {
  const f = card.fsrs;
  const empty = createEmptyCard(new Date(now));
  return {
    ...empty,
    due: new Date(card.due),
    stability: f.stability,
    difficulty: f.difficulty,
    elapsed_days: f.elapsedDays,
    scheduled_days: f.scheduledDays,
    // Pass the persisted step in (?? 0 covers cards saved before this field).
    learning_steps: f.learningSteps ?? 0,
    reps: f.reps,
    lapses: f.lapses,
    state: STATE_FROM_KIOKU[card.state],
    last_review: f.lastReview ? new Date(f.lastReview) : undefined,
  };
}

// ts-fsrs FsrsCard -> Kioku Card (merge back onto the original)
function fromFsrs(card: Card, fc: FsrsCard): Card {
  return {
    ...card,
    state: STATE_TO_KIOKU[fc.state],
    due: fc.due.getTime(),
    updatedAt: Date.now(),
    fsrs: {
      stability: fc.stability,
      difficulty: fc.difficulty,
      elapsedDays: fc.elapsed_days,
      scheduledDays: fc.scheduled_days,
      learningSteps: fc.learning_steps,
      reps: fc.reps,
      lapses: fc.lapses,
      lastReview: fc.last_review ? fc.last_review.getTime() : null,
    },
  };
}

export function makeFsrsScheduler(desiredRetention: number) {
  const s = buildScheduler(desiredRetention);
  return {
    preview(card: Card, now: number) {
      const rec = s.repeat(toFsrs(card, now), new Date(now));
      const out = {} as Record<Rating, { card: Card; intervalLabel: string }>;
      (Object.keys(RATING) as Rating[]).forEach((r) => {
        const next = rec[RATING[r]].card;
        out[r] = {
          card: fromFsrs(card, next),
          // From the real due, not scheduled_days — which rounds a sub-day
          // relearning step down to 0 and would mislabel "Errei" as "1 d".
          intervalLabel: labelInterval((next.due.getTime() - now) / DAY),
        };
      });
      return out;
    },
    apply(card: Card, rating: Rating, now: number, durationMs: number) {
      const res = s.next(toFsrs(card, now), new Date(now), RATING[rating]);
      const updated = fromFsrs(card, res.card);
      const log: ReviewLog = {
        id: uuid(),
        cardId: card.id,
        deckId: card.deckId,
        rating,
        reviewedAt: now,
        durationMs,
        prevState: card.state,
        scheduledDays: res.card.scheduled_days,
      };
      return { card: updated, log };
    },
  };
}
