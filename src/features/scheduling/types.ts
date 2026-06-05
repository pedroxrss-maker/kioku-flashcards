import type { Card, Rating, ReviewLog } from '../../db/types';

export interface RatingPreview {
  card: Card;
  intervalLabel: string;
}

/**
 * One interface both algorithms implement, so the review engine never branches
 * on algorithm type.
 */
export interface Scheduler {
  /** All four outcomes, so the UI can preview the interval on each button. */
  preview(card: Card, now: number): Record<Rating, RatingPreview>;
  /** Applies the chosen rating, returning the updated card + a review log. */
  apply(
    card: Card,
    rating: Rating,
    now: number,
    durationMs: number,
  ): { card: Card; log: ReviewLog };
}
