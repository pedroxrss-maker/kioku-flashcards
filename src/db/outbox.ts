/**
 * Durable write outbox (offline-first, phase 2). When a Supabase write fails
 * (offline / network error), the repository enqueues it here so it is never lost.
 *
 * This phase only RECORDS the queue — nothing replays it yet (a later phase adds
 * the flush/online logic). As with the local mirror, every op is try/catch-wrapped
 * so an IndexedDB failure can never break the app: writes log + move on, reads
 * return a safe empty/zero value, and nothing here throws to its caller.
 */
import { db, type OutboxRow } from './db';

type OutboxOp = OutboxRow['op'];

/** Best-effort error sink — an outbox failure is non-fatal by design. */
function warn(op: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[outbox] ${op} failed (ignored)`, err);
}

/**
 * Append a pending write. `payload` must hold everything needed to replay it
 * later (the domain objects, not DB rows). Returns the assigned seq, or undefined
 * if the enqueue itself failed (caller ignores it — best-effort).
 */
export async function enqueue(
  op: OutboxOp,
  entityId: string,
  payload: unknown,
): Promise<number | undefined> {
  try {
    return await db.outbox.add({ op, entityId, createdAt: Date.now(), status: 'pending', payload });
  } catch (err) {
    warn('enqueue', err);
    return undefined;
  }
}

/** All pending rows, oldest first (FIFO replay order). */
export async function listPending(): Promise<OutboxRow[]> {
  try {
    return await db.outbox.where('status').equals('pending').sortBy('seq');
  } catch (err) {
    warn('listPending', err);
    return [];
  }
}

/** Mark a queued write as successfully replayed. */
export async function markDone(seq: number): Promise<void> {
  try {
    await db.outbox.update(seq, { status: 'done' });
  } catch (err) {
    warn('markDone', err);
  }
}

/** Mark a queued write as failed (kept for inspection / future retry). */
export async function markError(seq: number): Promise<void> {
  try {
    await db.outbox.update(seq, { status: 'error' });
  } catch (err) {
    warn('markError', err);
  }
}

/** How many writes are still waiting to be replayed (0 on any failure). */
export async function countPending(): Promise<number> {
  try {
    return await db.outbox.where('status').equals('pending').count();
  } catch (err) {
    warn('countPending', err);
    return 0;
  }
}

/** Housekeeping: drop rows already marked done. */
export async function clearDone(): Promise<void> {
  try {
    await db.outbox.where('status').equals('done').delete();
  } catch (err) {
    warn('clearDone', err);
  }
}
