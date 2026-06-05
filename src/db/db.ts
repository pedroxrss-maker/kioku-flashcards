import Dexie, { type Table } from 'dexie';
import type { AppSettings, Card, Deck, MediaBlob, ReviewLog } from './types';

/**
 * IndexedDB persistence via Dexie. The UI never touches this directly — it goes
 * through the repository (see `repositories.ts`) so the storage engine can be
 * swapped for a remote/sync backend later without rewriting the UI.
 */
export class KiokuDB extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  reviewLogs!: Table<ReviewLog, string>;
  media!: Table<MediaBlob, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('kioku');
    this.version(1).stores({
      decks: 'id, createdAt, category',
      cards: 'id, deckId, state, due, [deckId+state], [deckId+due]',
      reviewLogs: 'id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
      media: 'id',
      settings: 'id',
    });
  }
}

export const db = new KiokuDB();
export { Dexie };
