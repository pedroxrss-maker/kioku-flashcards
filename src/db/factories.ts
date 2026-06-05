import type {
  AppSettings,
  Card,
  CardInput,
  Deck,
  DeckInput,
  FsrsFields,
  Sm2Fields,
} from './types';

/** Fresh sm2 sub-state for a brand-new card. */
export function newSm2Fields(): Sm2Fields {
  return {
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    lapses: 0,
    step: 0,
    isLeech: false,
  };
}

/** Fresh fsrs sub-state for a brand-new card (mirrors ts-fsrs empty card). */
export function newFsrsFields(): FsrsFields {
  return {
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
  };
}

export function makeDeck(input: DeckInput): Deck {
  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    color: input.color,
    category: input.category?.trim() || undefined,
    algorithm: input.algorithm ?? 'fsrs',
    createdAt: Date.now(),
    newPerDay: input.newPerDay ?? 20,
    reviewsPerDay: input.reviewsPerDay ?? 200,
    desiredRetention: input.desiredRetention ?? 0.9,
    buttonCount: input.buttonCount ?? 4,
    ttsLang: input.ttsLang ?? 'en-US',
  };
}

export function makeCard(input: CardInput): Card {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    deckId: input.deckId,
    front: input.front,
    back: input.back,
    state: 'new',
    due: now,
    sm2: newSm2Fields(),
    fsrs: newFsrsFields(),
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultSettings(): AppSettings {
  return {
    id: 'global',
    newPerDay: 20,
    reviewsPerDay: 200,
    defaultAlgorithm: 'fsrs',
    defaultDesiredRetention: 0.9,
    defaultButtonCount: 4,
    tts: {
      enabled: true,
      voiceURI: null,
      rate: 1,
      autoPronounceFront: false,
      elevenLabsApiKey: '',
      elevenLabsModel: 'eleven_multilingual_v2',
      elevenLabsVoiceId: '',
    },
    seededAt: null,
  };
}

/** Brand-friendly deck accent colors. */
export const DECK_COLORS = [
  '#ff3b1f', // accent red
  '#1f6dff', // blue
  '#00b569', // green
  '#ff9d00', // amber
  '#b14cff', // violet
  '#ff4d9d', // pink
  '#00c2c7', // teal
  '#ffd000', // yellow
] as const;
