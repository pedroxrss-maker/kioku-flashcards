/* ===========================================================================
   Kioku core data model (section 2 of the spec).
   All persisted entities + the global settings singleton live here.
   =========================================================================== */

export type Algorithm = 'sm2' | 'fsrs';
export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type ButtonCount = 2 | 3 | 4;

export interface Deck {
  id: string;
  name: string;
  color: string; // hex, used as the deck's category accent
  category?: string;
  algorithm: Algorithm; // selectable per deck, default 'fsrs'
  createdAt: number;
  // per-deck study settings (override global defaults)
  newPerDay: number; // default 20
  reviewsPerDay: number; // default 200
  desiredRetention: number; // FSRS only, default 0.9
  buttonCount: ButtonCount; // King of Buttons: how many answer buttons
  ttsLang: string; // per-deck default TTS language, e.g. 'en-US' (extension)
}

export interface Sm2Fields {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  step: number;
  isLeech: boolean;
}

export interface FsrsFields {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
}

export interface Card {
  id: string;
  deckId: string;
  front: string; // rich HTML
  back: string; // rich HTML
  state: CardState;
  due: number; // epoch ms
  sm2: Sm2Fields;
  fsrs: FsrsFields;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  rating: Rating;
  reviewedAt: number; // epoch ms
  durationMs: number;
  prevState: CardState;
  scheduledDays: number;
}

export interface MediaBlob {
  id: string; // referenced from card HTML as kioku-media://<id>
  mime: string;
  data: Blob; // images stored as Blob in IndexedDB, not base64 in HTML
  createdAt: number;
}

/** Global app settings — a single 'global' row. (Extension of the spec.) */
export interface AppSettings {
  id: 'global';
  newPerDay: number;
  reviewsPerDay: number;
  defaultAlgorithm: Algorithm;
  defaultDesiredRetention: number; // 0.80 – 0.97
  defaultButtonCount: ButtonCount;
  tts: {
    enabled: boolean;
    voiceURI: string | null;
    rate: number; // 0.5 – 1.5
    autoPronounceFront: boolean;
    // ElevenLabs cloud TTS (generate-and-store). Key lives only in IndexedDB.
    elevenLabsApiKey: string;
    elevenLabsModel: string; // model_id, default 'eleven_multilingual_v2'
    elevenLabsVoiceId: string; // default voice_id
  };
  seededAt: number | null; // first-run seed marker
}

/* --------------------------------------------------------- creation inputs */

export interface DeckInput {
  name: string;
  color: string;
  category?: string;
  algorithm?: Algorithm;
  newPerDay?: number;
  reviewsPerDay?: number;
  desiredRetention?: number;
  buttonCount?: ButtonCount;
  ttsLang?: string;
}

export interface CardInput {
  deckId: string;
  front: string;
  back: string;
}

/** Per-deck progress against the daily caps, for a given local day. */
export interface DailyProgress {
  newDone: number;
  reviewsDone: number;
}
