import { SupabaseRepository } from './supabaseRepo';
import type {
  AchievementUnlock,
  AppSettings,
  Card,
  CardInput,
  DailyProgress,
  Deck,
  DeckCountSet,
  DeckInput,
  GamificationState,
  MediaBlob,
  ReviewLog,
  XpResult,
} from './types';

/**
 * Storage-agnostic repository interface. The app is backed by Supabase (see
 * `supabaseRepo.ts`); the original Dexie/IndexedDB implementation has been
 * retired as the source of truth (media still uses IndexedDB internally).
 */
export interface KiokuRepository {
  // decks
  listDecks(): Promise<Deck[]>;
  getDeck(id: string): Promise<Deck | undefined>;
  createDeck(input: DeckInput): Promise<Deck>;
  updateDeck(id: string, patch: Partial<Deck>): Promise<void>;
  deleteDeck(id: string): Promise<void>;
  /** Reset all scheduling in a deck: every card back to "new", history cleared. */
  resetDeck(id: string): Promise<void>;

  // cards
  listCards(deckId: string): Promise<Card[]>;
  getCard(id: string): Promise<Card | undefined>;
  allCards(): Promise<Card[]>;
  createCard(input: CardInput): Promise<Card>;
  bulkInsertCards(cards: Card[]): Promise<void>;
  /** First-run seed: insert a deck + its cards as one unit with a SINGLE
   *  invalidate at the end, so the optimistic seed cache isn't churned by a
   *  per-insert refetch mid-seed. */
  seedDeckWithCards(deck: Deck, cards: Card[]): Promise<void>;
  updateCard(id: string, patch: Partial<Card>): Promise<void>;
  putCard(card: Card): Promise<void>;
  deleteCard(id: string): Promise<void>;
  countCards(deckId: string): Promise<number>;
  /** Per-deck counts for the user in ONE request (the deck_counts() RPC). No card
   *  rows; decks with zero cards are absent (treat a missing id as all-zeros). */
  deckCounts(): Promise<Record<string, DeckCountSet>>;
  /** The due/new cards a review session needs from one deck (never the whole deck). */
  dueQueueCards(
    deckId: string,
    opts: { reviewLimit: number; newLimit: number; nowMs: number },
  ): Promise<Card[]>;

  // review
  saveReview(card: Card, log: ReviewLog): Promise<void>;
  /** Undo a review: restore the card's pre-review state and delete its log. */
  undoReview(card: Card, logId: string): Promise<void>;
  dailyProgress(deckId: string, dayStart: number): Promise<DailyProgress>;
  /** All-time review count via a server-side HEAD count (no log rows). */
  countReviews(): Promise<number>;
  /** Total card count across all decks via a server-side HEAD count (no card rows). */
  countAllCards(): Promise<number>;
  /** The signed-in user's current streak via the my_streak() RPC (no log rows). */
  myStreak(): Promise<number>;
  allLogs(): Promise<ReviewLog[]>;
  logsSince(ts: number): Promise<ReviewLog[]>;
  deckLogsSince(deckId: string, ts: number): Promise<ReviewLog[]>;

  // media
  getMedia(id: string): Promise<MediaBlob | undefined>;
  putMedia(media: MediaBlob): Promise<void>;

  // settings
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  // gamification (XP / level + achievement-unlock history)
  getGamification(): Promise<GamificationState>;
  /** Add XP (upsert); returns the new state + whether a level was crossed. */
  addXp(amount: number): Promise<XpResult>;
  /** Record an achievement unlock; returns true if it was newly unlocked. */
  unlockAchievement(key: string): Promise<boolean>;
  listAchievements(): Promise<AchievementUnlock[]>;

  // maintenance
  resetAll(): Promise<void>;
}

export const repo: KiokuRepository = new SupabaseRepository();
