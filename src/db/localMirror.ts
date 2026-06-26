/**
 * Local mirror of the Supabase data in IndexedDB (Dexie). Phase 1 of offline-first.
 *
 * These helpers write/read the `decks` / `cards` / `reviewLogs` Dexie tables (see
 * `db.ts`). They are called as SIDE EFFECTS alongside the existing Supabase
 * reads/writes in `supabaseRepo.ts` — the app still reads from Supabase exactly as
 * before; we are only ALSO keeping a local copy here.
 *
 * Robustness is the rule: every operation is wrapped so a Dexie failure (private
 * mode, blocked, quota) NEVER breaks the app. Writes swallow errors (log + move
 * on); reads return an empty array on failure. Nothing here throws to its caller.
 */
import { db } from './db';
import type { Card, Deck, ReviewLog } from './types';

/** Single best-effort error sink — a mirror failure is non-fatal by design. */
function warn(op: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.warn(`[localMirror] ${op} failed (ignored)`, err);
}

// ----------------------------------------------------------------- writes --

/** Upsert a batch of decks into the local mirror. */
export async function mirrorPutDecks(decks: Deck[]): Promise<void> {
  if (decks.length === 0) return;
  try {
    await db.decks.bulkPut(decks);
  } catch (err) {
    warn('mirrorPutDecks', err);
  }
}

/** Upsert a batch of cards into the local mirror. */
export async function mirrorPutCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) return;
  try {
    await db.cards.bulkPut(cards);
  } catch (err) {
    warn('mirrorPutCards', err);
  }
}

/** Upsert a single review log into the local mirror. */
export async function mirrorPutReviewLog(log: ReviewLog): Promise<void> {
  try {
    await db.reviewLogs.put(log);
  } catch (err) {
    warn('mirrorPutReviewLog', err);
  }
}

/** Remove a card from the local mirror (mirrors a Supabase delete). */
export async function mirrorDeleteCard(id: string): Promise<void> {
  try {
    await db.cards.delete(id);
  } catch (err) {
    warn('mirrorDeleteCard', err);
  }
}

/** Remove a review log from the local mirror (e.g. on undo). */
export async function mirrorDeleteReviewLog(id: string): Promise<void> {
  try {
    await db.reviewLogs.delete(id);
  } catch (err) {
    warn('mirrorDeleteReviewLog', err);
  }
}

// ------------------------------------------------------------------ reads --
// (Not wired into the app yet — a later phase decides when to read from here.)

/** All mirrored decks (empty array on any failure). */
export async function mirrorGetDecks(): Promise<Deck[]> {
  try {
    return await db.decks.toArray();
  } catch (err) {
    warn('mirrorGetDecks', err);
    return [];
  }
}

/** All mirrored cards for one deck (empty array on any failure). */
export async function mirrorGetCards(deckId: string): Promise<Card[]> {
  try {
    return await db.cards.where('deckId').equals(deckId).toArray();
  } catch (err) {
    warn('mirrorGetCards', err);
    return [];
  }
}

/** Every mirrored card across all decks (empty array on any failure). */
export async function mirrorGetAllCards(): Promise<Card[]> {
  try {
    return await db.cards.toArray();
  } catch (err) {
    warn('mirrorGetAllCards', err);
    return [];
  }
}
