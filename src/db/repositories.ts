import { Dexie, db } from './db';
import { defaultSettings, makeCard, makeDeck } from './factories';
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
 * Storage-agnostic repository interface. The Dexie implementation below is the
 * v1 backend; a future sync backend implements the same contract.
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

class DexieRepository implements KiokuRepository {
  // ---------------------------------------------------------------- decks --
  listDecks() {
    return db.decks.orderBy('createdAt').toArray();
  }
  getDeck(id: string) {
    return db.decks.get(id);
  }
  async createDeck(input: DeckInput) {
    const deck = makeDeck(input);
    await db.decks.add(deck);
    return deck;
  }
  async updateDeck(id: string, patch: Partial<Deck>) {
    await db.decks.update(id, patch);
  }
  async deleteDeck(id: string) {
    await db.transaction('rw', db.decks, db.cards, db.reviewLogs, async () => {
      await db.cards.where('deckId').equals(id).delete();
      await db.reviewLogs.where('deckId').equals(id).delete();
      await db.decks.delete(id);
    });
  }

  // ---------------------------------------------------------------- cards --
  listCards(deckId: string) {
    return db.cards.where('deckId').equals(deckId).toArray();
  }
  getCard(id: string) {
    return db.cards.get(id);
  }
  allCards() {
    return db.cards.toArray();
  }
  async createCard(input: CardInput) {
    const card = makeCard(input);
    await db.cards.add(card);
    return card;
  }
  async bulkInsertCards(cards: Card[]) {
    await db.cards.bulkAdd(cards);
  }
  async updateCard(id: string, patch: Partial<Card>) {
    await db.cards.update(id, { ...patch, updatedAt: Date.now() });
  }
  async putCard(card: Card) {
    await db.cards.put(card);
  }
  async deleteCard(id: string) {
    await db.cards.delete(id);
  }
  countCards(deckId: string) {
    return db.cards.where('deckId').equals(deckId).count();
  }

  // --------------------------------------------------------------- review --
  async saveReview(card: Card, log: ReviewLog) {
    await db.transaction('rw', db.cards, db.reviewLogs, async () => {
      await db.cards.put(card);
      await db.reviewLogs.add(log);
    });
  }
  async dailyProgress(deckId: string, dayStart: number): Promise<DailyProgress> {
    const logs = await db.reviewLogs
      .where('[deckId+reviewedAt]')
      .between([deckId, dayStart], [deckId, Dexie.maxKey])
      .toArray();
    let newDone = 0;
    let reviewsDone = 0;
    for (const l of logs) {
      if (l.prevState === 'new') newDone += 1;
      else if (l.prevState === 'review') reviewsDone += 1;
    }
    return { newDone, reviewsDone };
  }
  allLogs() {
    return db.reviewLogs.orderBy('reviewedAt').toArray();
  }
  logsSince(ts: number) {
    return db.reviewLogs.where('reviewedAt').aboveOrEqual(ts).toArray();
  }
  deckLogsSince(deckId: string, ts: number) {
    return db.reviewLogs
      .where('[deckId+reviewedAt]')
      .between([deckId, ts], [deckId, Dexie.maxKey])
      .toArray();
  }

  // ---------------------------------------------------------------- media --
  getMedia(id: string) {
    return db.media.get(id);
  }
  async putMedia(media: MediaBlob) {
    await db.media.put(media);
  }

  // ------------------------------------------------------------- settings --
  async getSettings(): Promise<AppSettings> {
    const existing = await db.settings.get('global');
    if (existing) return existing;
    const fresh = defaultSettings();
    await db.settings.put(fresh);
    return fresh;
  }
  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const next: AppSettings = { ...current, ...patch, id: 'global' };
    await db.settings.put(next);
    return next;
  }

  // ---------------------------------------------------------- maintenance --
  async resetAll() {
    await db.transaction(
      'rw',
      [db.decks, db.cards, db.reviewLogs, db.media, db.settings],
      async () => {
        await Promise.all([
          db.decks.clear(),
          db.cards.clear(),
          db.reviewLogs.clear(),
          db.media.clear(),
          db.settings.clear(),
        ]);
      },
    );
  }
}

export const repo: KiokuRepository = new DexieRepository();
