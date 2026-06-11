/* ===========================================================================
   Kioku core data model (section 2 of the spec).
   All persisted entities + the global settings singleton live here.
   =========================================================================== */

export type Algorithm = 'sm2' | 'fsrs';
export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type ButtonCount = 2 | 3 | 4;

/** Sentinel value for an uncapped daily limit — the queue delivers every card
 *  the scheduler (SM-2/FSRS) marks as due, with no per-day ceiling. */
export const UNLIMITED_PER_DAY = 1_000_000_000;

export interface Deck {
  id: string;
  name: string;
  color: string; // hex, used as the deck's category accent
  category?: string;
  algorithm: Algorithm; // selectable per deck, default 'sm2'
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
  /** ts-fsrs `learning_steps`: current step index within the learning/relearning
   *  queue. Persisted so multi-step learning survives reloads (camelCase here to
   *  match elapsedDays/scheduledDays/lastReview). */
  learningSteps: number;
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
  /** Storage object path of this card's primary audio (mp3), or null/undefined
   *  when it has none. Preferred over TTS in review. Backed by the private
   *  "media" bucket; never an inline data URL. */
  audioPath?: string | null;
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
  displayName: string; // shown in the dashboard greeting / user chip
  dailyGoal: number; // cards/day goal for the daily-progress ring
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
    // TTS na nuvem do Google (gera e salva MP3). A credencial fica no servidor
    // (Worker), nunca no aplicativo.
    provider: 'google';
    googleVoiceName: string; // ex.: 'en-US-Neural2-D'
    googleLanguageCode: string; // ex.: 'en-US'
  };
  seededAt: number | null; // first-run seed marker
  /** Per-deck logo: deckId -> preset icon id OR a data: URL (custom image). */
  deckIcons?: Record<string, string>;
  /** Show the interval preview (e.g. "1 min", "6 d") under each answer button. */
  showAnswerIntervals?: boolean;
  /** Show how many reviews remain ("Card X de Y") during a study session. */
  showRemainingCount?: boolean;
  /** Card ids that should NOT be auto-pronounced (cardId -> true). Stored here
   *  (settings jsonb) so no card-table column / migration is needed. */
  mutedCards?: Record<string, boolean>;
  /** Per-deck audio/pronunciation switch (deckId -> enabled). Unset = enabled
   *  (existing decks); new/imported decks store false. No migration needed. */
  deckAudio?: Record<string, boolean>;
  /** Which side a card's generated audio (cards.audio_path) speaks
   *  (cardId -> 'front' | 'back'). Unset = 'front' (legacy). Stored here (jsonb)
   *  so the single audio_path column needs no migration to know its side. */
  cardAudioSide?: Record<string, 'front' | 'back'>;
  /** Hierarchical deck paths (deckId -> full "A::B::C" path), used to nest decks
   *  into a tree at runtime. Unset / no "::" = a flat top-level deck (default).
   *  Stored here (settings jsonb) so no decks-table migration is needed; the
   *  deck's own `name` stays the clean leaf label. */
  deckPaths?: Record<string, string>;
  /** Collapsed nodes in the deck tree (full paths), persisted so expand/collapse
   *  survives reload. A path absent from this list renders expanded. */
  deckTreeCollapsed?: string[];
  /** Approximate running total of Supabase Storage bytes used by this user's
   *  media. Bumped after uploads so we can warn near the free-tier limit without
   *  listing the whole bucket. */
  storageBytesUsed?: number;
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
