import Dexie, { type Table } from 'dexie';
import type { AppSettings, Card, Deck, MediaBlob, ReviewLog } from './types';

/**
 * IndexedDB persistence via Dexie. The UI never touches this directly — it goes
 * through the repository (see `repositories.ts`) so the storage engine can be
 * swapped for a remote/sync backend later without rewriting the UI.
 *
 * Today `media` is the only live table. The offline-first work (phase 1) starts
 * mirroring `decks` / `cards` / `reviewLogs` here as a local copy of the Supabase
 * data — additive only; nothing reads from this mirror yet.
 */
export class KiokuDB extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  reviewLogs!: Table<ReviewLog, string>;
  media!: Table<MediaBlob, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('kioku');
    // v1: original schema (pre-mirror; only `media` was actually used).
    this.version(1).stores({
      decks: 'id, createdAt, category',
      cards: 'id, deckId, state, due, [deckId+state], [deckId+due]',
      reviewLogs: 'id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
      media: 'id',
      settings: 'id',
    });
    // v2: offline-first local mirror. decks/cards/reviewLogs now hold a real local
    // copy of the user's Supabase data, indexed for the reads a later phase needs.
    // Stored objects are the DOMAIN shape (camelCase), so indexes use those names:
    //   - decks have no `updatedAt` → index `createdAt` (+ keep `category`).
    //   - cards: `deckId` (per-deck lists), `updatedAt` (sync), `due` (queues).
    //   - reviewLogs: `cardId`, `reviewedAt`.
    // `media` / `settings` are unchanged, so they carry over from v1.
    this.version(2).stores({
      decks: 'id, createdAt, category',
      cards: 'id, deckId, updatedAt, due',
      reviewLogs: 'id, cardId, reviewedAt',
    });
  }
}

export const db = new KiokuDB();
export { Dexie };
