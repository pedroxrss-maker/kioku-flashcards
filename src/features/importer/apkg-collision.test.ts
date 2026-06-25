// @vitest-environment jsdom
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollisionResolution } from './apkg-import';

/**
 * End-to-end coverage of the deck-name COLLISION flow in importApkg: re-importing
 * an .apkg whose deck name already exists must detect the clash (case-insensitive,
 * trimmed, full path) and apply the caller's choice — replace / keep both / cancel.
 *
 * The real SQLite engine (sql.js, loaded from a CDN) and the repo/media layers are
 * stubbed so the test drives the actual importApkg logic against an in-memory repo:
 *   - ./sqljs        → a fake Database that answers importApkg's queries from `sqlCfg`
 *   - ../../db/repositories → an in-memory repo recording create/delete/insert/save
 *   - ../media/*     → no-op (the test cards carry no media)
 */
const h = vi.hoisted(() => {
  let idCounter = 0;
  const state = {
    decks: new Map<string, { id: string; name: string }>(),
    settings: {
      deckPaths: {} as Record<string, string>,
      deckAudio: {} as Record<string, boolean>,
      newPerDay: 20,
      reviewsPerDay: 200,
      defaultDesiredRetention: 0.9,
    },
    created: [] as Array<{ id: string; name: string }>,
    deleted: [] as string[],
    inserted: [] as unknown[],
  };

  const repo = {
    listDecks: async () => Array.from(state.decks.values()),
    getSettings: async () => state.settings,
    saveSettings: async (patch: Record<string, unknown>) => {
      Object.assign(state.settings, patch);
      return state.settings;
    },
    createDeck: async (input: { name: string }) => {
      idCounter += 1;
      const deck = { ...input, id: `new-${idCounter}` };
      state.decks.set(deck.id, deck);
      state.created.push(deck);
      return deck;
    },
    deleteDeck: async (id: string) => {
      state.decks.delete(id);
      state.deleted.push(id);
    },
    bulkInsertCards: async (cards: unknown[]) => {
      state.inserted.push(...cards);
    },
  };

  // What the fake SQLite returns for the queries importApkg issues.
  const sqlCfg = {
    deckRows: [] as unknown[][], // SELECT id, name FROM decks
    cardRows: [] as unknown[][], // cards JOIN notes
    noteFlds: [] as unknown[][], // SELECT flds FROM notes (placeholder check)
    crt: 1_700_000_000, // col.crt (seconds)
  };
  class FakeDatabase {
    constructor(_bytes: unknown) {}
    exec(sql: string) {
      const wrap = (values: unknown[][]) => (values.length ? [{ values }] : []);
      if (sql.includes('cards c JOIN notes')) return wrap(sqlCfg.cardRows);
      if (sql.includes('FROM decks')) return wrap(sqlCfg.deckRows);
      if (sql.includes('flds FROM notes')) return wrap(sqlCfg.noteFlds);
      if (sql.includes('crt FROM col')) return wrap([[sqlCfg.crt]]);
      return []; // templates / models / legacy fallbacks → empty
    }
    close() {}
  }

  return {
    state,
    repo,
    sqlCfg,
    FakeDatabase,
    reset() {
      idCounter = 0;
      state.decks.clear();
      state.settings = {
        deckPaths: {},
        deckAudio: {},
        newPerDay: 20,
        reviewsPerDay: 200,
        defaultDesiredRetention: 0.9,
      };
      state.created = [];
      state.deleted = [];
      state.inserted = [];
      sqlCfg.deckRows = [];
      sqlCfg.cardRows = [];
      sqlCfg.noteFlds = [];
    },
  };
});

vi.mock('./sqljs', () => ({ loadSqlJs: async () => ({ Database: h.FakeDatabase }) }));
vi.mock('../../db/repositories', () => ({ repo: h.repo }));
vi.mock('../media/storage', () => ({
  currentUserId: async () => 'uid',
  sanitizeSegment: (s: string) => s,
  uploadMedia: async () => {},
  StorageUnavailableError: class extends Error {},
}));
vi.mock('../media/usage', () => ({
  recordStorageUpload: async () => ({}),
  warnIfStorageHigh: () => {},
}));
vi.mock('../media/image', () => ({
  resizeImageBlob: async (blob: Blob) => ({ blob, contentType: 'image/png' }),
}));

import { importApkg } from './apkg-import';

const FIELD_SEP = String.fromCharCode(0x1f);

/** A minimal real zip carrying a (dummy) collection member; the fake DB ignores
 *  the bytes and answers from sqlCfg. */
async function makeApkgBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('collection.anki21', new Uint8Array([1, 2, 3]));
  return zip.generateAsync({ type: 'uint8array' });
}

/** Configure the .apkg to contain ONE deck (given full-path name) with one card. */
function setApkgSingleDeck(name: string, did = 1) {
  const flds = `Front${FIELD_SEP}Back`;
  h.sqlCfg.deckRows = [[did, name]];
  // [type, queue, due, ivl, factor, reps, lapses, data, flds, did, ord, mid]
  h.sqlCfg.cardRows = [[0, 0, 0, 0, 0, 0, 0, '', flds, did, 0, '']];
  h.sqlCfg.noteFlds = [[flds]];
}

/** Seed an existing deck (optionally with a deckPaths full-path entry). */
function seedDeck(id: string, name: string, path?: string) {
  h.state.decks.set(id, { id, name });
  if (path !== undefined) h.state.settings.deckPaths[id] = path;
  h.state.settings.deckAudio[id] = false;
}

async function runImport(onCollision: (names: string[]) => Promise<CollisionResolution>) {
  return importApkg(await makeApkgBytes(), 'deck.apkg', undefined, undefined, onCollision);
}

describe('importApkg — deck name collisions', () => {
  beforeEach(() => h.reset());

  it("'replace' deletes the existing same-named deck, cleans its settings, and imports one clean deck", async () => {
    seedDeck('old-1', 'Geografia', 'Geografia');
    setApkgSingleDeck('Geografia');
    const onCollision = vi.fn(async () => 'replace' as const);

    const res = await runImport(onCollision);

    expect(onCollision).toHaveBeenCalledTimes(1);
    expect(onCollision).toHaveBeenCalledWith(['Geografia']);
    // Old deck deleted, exactly one new deck created → one deck total.
    expect(h.state.deleted).toEqual(['old-1']);
    expect(h.state.created).toHaveLength(1);
    expect(h.state.decks.has('old-1')).toBe(false);
    expect(h.state.decks.size).toBe(1);
    // Old settings entries pruned; new deck's path/audio present (no orphans).
    const newId = h.state.created[0].id;
    expect(h.state.settings.deckPaths['old-1']).toBeUndefined();
    expect(h.state.settings.deckAudio['old-1']).toBeUndefined();
    expect(h.state.settings.deckPaths[newId]).toBe('Geografia');
    expect(h.state.settings.deckAudio[newId]).toBe(false);
    // The new deck's cards were inserted.
    expect(h.state.inserted.length).toBeGreaterThan(0);
    expect(res.deckCount).toBe(1);
  });

  it("'replace' removes ALL pre-existing duplicate decks with that name → exactly one clean deck", async () => {
    seedDeck('old-1', 'Geografia', 'Geografia');
    seedDeck('old-2', 'Geografia', 'Geografia'); // the user's current duplicate situation
    setApkgSingleDeck('Geografia');

    await runImport(async () => 'replace');

    // Both duplicates deleted; one new deck imported.
    expect(h.state.deleted).toEqual(expect.arrayContaining(['old-1', 'old-2']));
    expect(h.state.deleted).toHaveLength(2);
    expect(h.state.created).toHaveLength(1);
    expect(h.state.decks.has('old-1')).toBe(false);
    expect(h.state.decks.has('old-2')).toBe(false);
    expect(h.state.decks.size).toBe(1);
    // Neither old deck leaves orphaned settings.
    expect(h.state.settings.deckPaths['old-1']).toBeUndefined();
    expect(h.state.settings.deckPaths['old-2']).toBeUndefined();
    expect(h.state.settings.deckAudio['old-1']).toBeUndefined();
    expect(h.state.settings.deckAudio['old-2']).toBeUndefined();
  });

  it("'separate' keeps the existing deck and imports an additional one", async () => {
    seedDeck('old-1', 'Geografia', 'Geografia');
    setApkgSingleDeck('Geografia');
    const onCollision = vi.fn(async () => 'separate' as const);

    await runImport(onCollision);

    expect(onCollision).toHaveBeenCalledTimes(1);
    expect(h.state.deleted).toHaveLength(0); // nothing removed
    expect(h.state.created).toHaveLength(1); // a new, separate deck
    expect(h.state.decks.has('old-1')).toBe(true); // existing deck kept
    expect(h.state.decks.size).toBe(2);
    // Both decks' settings coexist.
    const newId = h.state.created[0].id;
    expect(h.state.settings.deckPaths['old-1']).toBe('Geografia');
    expect(h.state.settings.deckPaths[newId]).toBe('Geografia');
  });

  it("'cancel' creates nothing and rolls back clean", async () => {
    seedDeck('old-1', 'Geografia', 'Geografia');
    setApkgSingleDeck('Geografia');
    const onCollision = vi.fn(async () => 'cancel' as const);

    await expect(runImport(onCollision)).rejects.toThrow();

    expect(onCollision).toHaveBeenCalledTimes(1);
    expect(h.state.created).toHaveLength(0); // no deck created
    expect(h.state.deleted).toHaveLength(0); // nothing deleted
    expect(h.state.inserted).toHaveLength(0); // no cards inserted
    expect(h.state.decks.size).toBe(1); // existing deck untouched
    expect(h.state.decks.has('old-1')).toBe(true);
    expect(h.state.settings.deckPaths['old-1']).toBe('Geografia'); // settings unchanged
  });

  it('does NOT prompt when there is no name collision (imports normally)', async () => {
    seedDeck('old-1', 'História', 'História');
    setApkgSingleDeck('Geografia'); // different name
    const onCollision = vi.fn(async () => 'cancel' as const); // would abort if (wrongly) called

    const res = await runImport(onCollision);

    expect(onCollision).not.toHaveBeenCalled();
    expect(h.state.created).toHaveLength(1);
    expect(h.state.decks.has('old-1')).toBe(true);
    expect(h.state.decks.size).toBe(2);
    expect(res.deckCount).toBe(1);
  });

  it('detects collisions case-insensitively and ignoring surrounding whitespace', async () => {
    // Existing deck has mixed case + surrounding spaces and NO deckPaths entry, so
    // the match must fall back to deck.name and normalize (trim + lowercase).
    seedDeck('old-1', '  GeOgRaFiA  ');
    setApkgSingleDeck('geografia');
    const onCollision = vi.fn(async () => 'separate' as const);

    await runImport(onCollision);

    expect(onCollision).toHaveBeenCalledTimes(1);
    expect(onCollision).toHaveBeenCalledWith(['geografia']);
  });
});
