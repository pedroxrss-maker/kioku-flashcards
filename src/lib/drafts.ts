/**
 * Tiny IndexedDB-backed store for in-progress form drafts (create/edit deck, add
 * cards). Drafts survive navigation AND closing/reopening the browser, so leaving
 * one of those screens never loses work — it's restored on return.
 *
 * Robustness is the rule: every operation is wrapped so that if IndexedDB is
 * unavailable (private mode, blocked, old browser), each function quietly no-ops
 * (reads return null, writes do nothing) and the screens keep working WITHOUT
 * persistence — the user is never blocked. We deliberately do NOT use
 * localStorage (blocked in this environment).
 *
 * Each record is `{ data, savedAt }`. Drafts older than DRAFT_TTL_MS are treated
 * as absent and deleted on read; cleanupDrafts() sweeps the rest on app start.
 */

const DB_NAME = 'kioku-drafts';
const STORE = 'drafts';
const DB_VERSION = 1;

/** Drafts expire after ~7 days so stale work doesn't haunt the user. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface DraftRecord<T> {
  data: T;
  savedAt: number;
}

/** Pure expiry check (exported for testing). */
export function isDraftExpired(savedAt: number, now: number = Date.now()): boolean {
  return typeof savedAt !== 'number' || !Number.isFinite(savedAt) || now - savedAt > DRAFT_TTL_MS;
}

// Single shared connection promise per isolate; null if IndexedDB is unusable.
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Read a draft's data. Returns null if missing, expired (deleting it), or on any
 *  failure (so callers can `?? fallback`). */
export async function getDraft<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const rec = req.result as DraftRecord<T> | undefined;
        if (!rec || typeof rec !== 'object') {
          resolve(null);
          return;
        }
        if (isDraftExpired(rec.savedAt)) {
          void deleteDraft(key);
          resolve(null);
          return;
        }
        resolve((rec.data ?? null) as T | null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Write/replace a draft (stamped with the current time). Best-effort. */
export async function setDraft<T>(key: string, data: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const rec: DraftRecord<T> = { data, savedAt: Date.now() };
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Delete a draft. Best-effort. */
export async function deleteDraft(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Sweep every expired draft. Call once on app start. Best-effort. */
export async function cleanupDrafts(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const cursorReq = tx.objectStore(STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const rec = cursor.value as DraftRecord<unknown> | undefined;
        if (!rec || typeof rec !== 'object' || isDraftExpired(rec.savedAt)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
