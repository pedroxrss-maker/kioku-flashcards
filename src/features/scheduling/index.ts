import type { Deck } from '../../db/types';
import { makeFsrsScheduler } from './fsrs-adapter';
import { DEFAULT_SM2, makeSm2Scheduler } from './sm2-adapter';
import type { Scheduler } from './types';

/**
 * Returns the right scheduler for a deck, so the review engine never branches
 * on algorithm type.
 */
export function schedulerForDeck(deck: Deck): Scheduler {
  return deck.algorithm === 'fsrs'
    ? makeFsrsScheduler(deck.desiredRetention)
    : makeSm2Scheduler(DEFAULT_SM2);
}

export { makeFsrsScheduler } from './fsrs-adapter';
export { makeSm2Scheduler, DEFAULT_SM2, labelInterval } from './sm2-adapter';
export type { Sm2Config } from './sm2-adapter';
export type { Scheduler, RatingPreview } from './types';
