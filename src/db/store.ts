/**
 * Tiny reactive query layer that replaces Dexie's liveQuery for the Supabase
 * backend. A keyed in-memory cache lets the read hooks keep their exact old
 * signatures (so components don't change) while staying reactive: every write
 * calls invalidate(), which refetches all active queries in the background.
 *
 * Coarse-grained on purpose — the app's data volume is small and correctness
 * (no stale UI after a write) matters more than minimal refetching.
 */
import { useEffect, useState } from 'react';

interface Entry {
  data?: unknown;
  error?: unknown;
  loaded: boolean;
  promise?: Promise<void>;
  refetchQueued?: boolean;
  fetcher?: () => Promise<unknown>;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let mutationVersion = 0;

function notify() {
  for (const l of listeners) l();
}

function entryFor(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { loaded: false };
    cache.set(key, e);
  }
  return e;
}

function run(key: string, fetcher: () => Promise<unknown>): void {
  const e = entryFor(key);
  e.fetcher = fetcher;
  if (e.promise) {
    // A fetch is already in flight — queue exactly one refetch so a write that
    // lands mid-flight still results in fresh data.
    e.refetchQueued = true;
    return;
  }
  e.promise = Promise.resolve()
    .then(() => (e.fetcher as () => Promise<unknown>)())
    .then((data) => {
      e.data = data;
      e.loaded = true;
      e.error = undefined;
    })
    .catch((err) => {
      e.error = err;
    })
    .then(() => {
      e.promise = undefined;
      notify();
      if (e.refetchQueued) {
        e.refetchQueued = false;
        run(key, e.fetcher as () => Promise<unknown>);
      }
    });
  notify();
}

/** Refetch every active LIVE query (call after any successful write). Non-live
 *  queries (e.g. whole-deck card rows) deliberately ignore this — they are
 *  refreshed only on mount-when-empty, explicit reload(), or refetchKeys(). */
export function invalidate(): void {
  mutationVersion += 1;
  notify();
}

/**
 * Re-run ONLY the cached queries whose key matches — WITHOUT bumping the global
 * mutation version. Used to refresh a targeted set (e.g. just the card-row
 * queries after a card edit) without sweeping in everything. A review write must
 * NOT match any card-row key here, so saving a review never re-downloads a deck.
 */
export function refetchKeys(match: (key: string) => boolean): void {
  for (const [key, e] of cache) {
    if (e.fetcher && match(key)) run(key, e.fetcher);
  }
}

/** Drop all cached query data — call on sign-out / account switch so one user
 *  never sees another's cached rows before the RLS-scoped refetch lands. */
export function clearQueryCache(): void {
  cache.clear();
  mutationVersion += 1;
  notify();
}

/** Read the cached value for a key (undefined if not loaded yet). */
export function getQueryData<T>(key: string): T | undefined {
  const e = cache.get(key);
  return e && e.loaded ? (e.data as T) : undefined;
}

/**
 * Optimistically set a key's cached value and re-render subscribers — used to
 * make per-keystroke writes (e.g. Settings) feel instant without a round-trip.
 */
export function setQueryData<T>(key: string, data: T): void {
  const e = entryFor(key);
  e.data = data;
  e.loaded = true;
  e.error = undefined;
  notify();
}

export interface QueryResult<T> {
  data: T;
  loading: boolean;
  loaded: boolean;
  error: unknown;
  reload: () => void;
}

export interface QueryOptions {
  /**
   * `false` = a HEAVY, on-demand query (whole-deck card rows): fetch ONCE when not
   * already cached, then ignore the coarse invalidate() and don't re-download on
   * remount — refresh only via reload() or refetchKeys(). Default `true` (the
   * query refetches on mount and after every write, as before).
   */
  live?: boolean;
}

/**
 * Subscribe a component to a keyed async read. Returns the last known data
 * (kept across refetches so the UI never flashes empty), plus loading/error.
 */
export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  initial: T,
  options?: QueryOptions,
): QueryResult<T> {
  const live = options?.live !== false;
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  // Live: fetch on mount, key change, and every invalidate(). Non-live: fetch only
  // when not already cached (so a remount reuses the cache — no re-download), and
  // never on the coarse invalidate (mutationVersion is dropped from the deps).
  useEffect(() => {
    if (live || !entryFor(key).loaded) run(key, fetcher as () => Promise<unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, live ? mutationVersion : -1]);

  const e = entryFor(key);
  return {
    data: e.loaded ? (e.data as T) : initial,
    loading: !e.loaded && e.error === undefined,
    loaded: e.loaded,
    error: e.error,
    reload: () => run(key, fetcher as () => Promise<unknown>),
  };
}
