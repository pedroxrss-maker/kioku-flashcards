import { SupabaseRepository } from './supabaseRepo';
import type {
  AppSettings,
  Card,
  CardInput,
  DailyProgress,
  Deck,
  DeckInput,
  MediaBlob,
  ReviewLog,
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

  // cards
  listCards(deckId: string): Promise<Card[]>;
  getCard(id: string): Promise<Card | undefined>;
  allCards(): Promise<Card[]>;
  createCard(input: CardInput): Promise<Card>;
  bulkInsertCards(cards: Card[]): Promise<void>;
  updateCard(id: string, patch: Partial<Card>): Promise<void>;
  putCard(card: Card): Promise<void>;
  deleteCard(id: string): Promise<void>;
  countCards(deckId: string): Promise<number>;

  // review
  saveReview(card: Card, log: ReviewLog): Promise<void>;
  dailyProgress(deckId: string, dayStart: number): Promise<DailyProgress>;
  allLogs(): Promise<ReviewLog[]>;
  logsSince(ts: number): Promise<ReviewLog[]>;
  deckLogsSince(deckId: string, ts: number): Promise<ReviewLog[]>;

  // media
  getMedia(id: string): Promise<MediaBlob | undefined>;
  putMedia(media: MediaBlob): Promise<void>;

  // settings
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  // maintenance
  resetAll(): Promise<void>;
}

export const repo: KiokuRepository = new SupabaseRepository();
