/**
 * Outbox replay (offline-first, phase 3b). Drains the durable write queue (phase 2)
 * back to Supabase when connectivity returns, in FIFO (seq) order.
 *
 * Safety / idempotency:
 *   - Every replayed write is an UPSERT keyed on the row's `id` (the cards and
 *     review_logs primary key), so re-sending a write that already landed is a
 *     no-op overwrite — never a duplicate. `undoReview` re-upserts the restored
 *     card and deletes the log by id (deleting a missing row is a no-op).
 *   - We re-send DIRECTLY to Supabase here (not through the repo methods, which
 *     would re-enqueue on failure) to avoid feedback loops.
 *   - A single in-flight guard (`running`) prevents concurrent drains.
 *   - On a NETWORK error mid-drain we STOP and leave the rest pending (retried
 *     next time). On a real (non-network) rejection we mark that one row 'error'
 *     and continue, so a poison row can't block the queue forever.
 */
import { supabase } from '../lib/supabase';
import type { OutboxRow } from './db';
import { cardToRow, logToRow, refreshCardQueries } from './supabaseRepo';
import { invalidate } from './store';
import { clearDone, countPending, listPending, markDone, markError } from './outbox';
import type { Card, ReviewLog } from './types';

/** Payload shapes enqueued by the repo (see supabaseRepo write methods). */
interface SaveReviewPayload {
  card: Card;
  log: ReviewLog;
}
interface CreateCardPayload {
  card: Card;
}
interface UndoReviewPayload {
  card: Card;
  logId: string;
}

/**
 * Same pragmatic connectivity check the repo reads use (kept local so the sync
 * loop owns its stop rule): browser offline, or an error that looks like a
 * fetch/network failure — NOT an auth error or a real Postgres/constraint error.
 */
function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  let msg = '';
  if (err instanceof Error) msg = err.message;
  else if (typeof err === 'object' && err !== null && 'message' in err) {
    msg = String((err as { message: unknown }).message);
  } else if (typeof err === 'string') msg = err;
  if (!msg) return false;
  return /failed to fetch|fetch failed|network ?error|load failed|err_network|err_internet|err_connection|net::|networkerror|timeout|offline/i.test(
    msg,
  );
}

/** Cached user id for stamping rows; null if there's no session (can't replay). */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Re-send one queued write to Supabase. Throws on any Supabase error (the caller
 * decides network-stop vs poison-skip). All writes are idempotent upserts/deletes.
 */
async function replayRow(row: OutboxRow, userId: string): Promise<void> {
  if (row.op === 'saveReview') {
    const { card, log } = row.payload as SaveReviewPayload;
    const cardRes = await supabase.from('cards').upsert(cardToRow(card, userId), { onConflict: 'id' });
    if (cardRes.error) throw cardRes.error;
    // review_logs.id is the PK → upsert on it makes a re-send a no-op (no dup row).
    const logRes = await supabase.from('review_logs').upsert(logToRow(log, userId), { onConflict: 'id' });
    if (logRes.error) throw logRes.error;
    return;
  }
  if (row.op === 'createCard') {
    const { card } = row.payload as CreateCardPayload;
    const res = await supabase.from('cards').upsert(cardToRow(card, userId), { onConflict: 'id' });
    if (res.error) throw res.error;
    return;
  }
  if (row.op === 'undoReview') {
    const { card, logId } = row.payload as UndoReviewPayload;
    const cardRes = await supabase.from('cards').upsert(cardToRow(card, userId), { onConflict: 'id' });
    if (cardRes.error) throw cardRes.error;
    const delRes = await supabase.from('review_logs').delete().eq('id', logId).eq('user_id', userId);
    if (delRes.error) throw delRes.error;
  }
}

// Single in-flight guard: never run two drains at once.
let running = false;

/**
 * Drain the outbox to Supabase. No-op when already running, offline, or there's no
 * session. Stops on the first network error (leaves the rest pending); skips poison
 * rows (marks 'error') and keeps going.
 */
export async function flushOutbox(): Promise<void> {
  if (running) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  running = true;
  try {
    const userId = await currentUserId();
    if (!userId) return; // not signed in / no session: nothing to replay safely

    const pending = await listPending(); // seq asc (FIFO)
    let synced = 0; // count of rows actually replayed (markDone'd) this run
    for (const row of pending) {
      if (row.seq === undefined) continue; // shouldn't happen (auto-increment PK)
      try {
        await replayRow(row, userId);
        await markDone(row.seq);
        synced += 1;
      } catch (err) {
        if (isNetworkError(err)) {
          // Connectivity dropped again → stop; remaining rows retry next time.
          return;
        }
        // Real rejection (e.g. constraint): quarantine this row, keep draining.
        // eslint-disable-next-line no-console
        console.error('[syncEngine] poison outbox row, marking error', { seq: row.seq, op: row.op }, err);
        await markError(row.seq);
      }
    }
    await clearDone(); // housekeeping once the queue drained cleanly
    if (synced > 0) {
      // We pushed real writes to the server → refresh the UI so it reflects server
      // truth (closes the flush-vs-read race; no manual reload needed). Skipped on
      // an empty / poison-only flush (nothing changed on the server).
      invalidate();
      refreshCardQueries();
    }
  } finally {
    running = false;
  }
}

// Periodic backstop handle (guards against double-init).
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Debounce handle so ONE offline→online transition triggers ONE reconnect sync
// (browsers can fire 'online' more than once for a single transition).
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const RECONNECT_DEBOUNCE_MS = 300;

/**
 * On reconnect: drain the outbox, then ALWAYS re-sync mounted queries to server
 * truth — even if this flush drained nothing. The outbox is often already empty by
 * the time the user looks (an earlier load-flush or the 60s poll drained it), so a
 * synced-count gate would leave the mounted UI stale until a manual reload. Coming
 * back online is itself the signal that mounted live/card queries should refetch.
 */
function scheduleReconnectSync(): void {
  if (reconnectTimer !== null) return; // coalesce repeat 'online' events into one run
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void flushOutbox().finally(() => {
      invalidate();
      refreshCardQueries();
    });
  }, RECONNECT_DEBOUNCE_MS);
}

/**
 * Wire the replay triggers (call ONCE, e.g. from main.tsx — not mounted yet):
 *   - on 'online': drain the outbox AND always refresh the UI (debounced)
 *   - flush on init if already online (drain leftovers from a previous session)
 *   - a light 60s poll that flushes only when online AND there's pending work
 */
export function initSyncEngine(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', scheduleReconnectSync);

  if (navigator.onLine) void flushOutbox();

  if (pollTimer === null) {
    pollTimer = setInterval(() => {
      if (!navigator.onLine) return;
      void countPending().then((n) => {
        if (n > 0) void flushOutbox();
      });
    }, 60_000);
  }
}
