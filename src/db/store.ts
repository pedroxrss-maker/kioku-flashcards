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

/** Refetch every active query (call after any successful write). */
export function invalidate(): void {
  mutationVersion += 1;
  notify();
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

/**
 * Subscribe a component to a keyed async read. Returns the last known data
 * (kept across refetches so the UI never flashes empty), plus loading/error.
 */
export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  initial: T,
): QueryResult<T> {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  // Fetch on mount, when the key changes, or after any invalidate().
  useEffect(() => {
    run(key, fetcher as () => Promise<unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mutationVersion]);

  const e = entryFor(key);
  return {
    data: e.loaded ? (e.data as T) : initial,
    loading: !e.loaded && e.error === undefined,
    loaded: e.loaded,
    error: e.error,
    reload: () => run(key, fetcher as () => Promise<unknown>),
  };
}
