/**
 * Supabase-backed implementation of KiokuRepository. All decks/cards/review
 * logs/settings live in Postgres; access is the configured supabase-js client
 * only, and isolation relies on the RLS policies already in place (never a
 * service key). Media stays in IndexedDB for now (media sync is a later step).
 *
 * Mapping rules (see the migration spec):
 *  - Postgres columns are snake_case; the app model is camelCase. Only top-level
 *    columns are renamed — keys INSIDE jsonb (sm2, fsrs, profiles.settings) are
 *    left untouched.
 *  - timestamptz columns are ISO strings on the wire and epoch ms in the model:
 *    read = new Date(col).getTime(); write = new Date(value).toISOString().
 *  - decks has no tts_lang column in the mapping, so ttsLang is not persisted;
 *    it reads back as a sensible default.
 */
import { supabase } from '../lib/supabase';
import { db } from './db';
import {
  mirrorDeleteReviewLog,
  mirrorGetCards,
  mirrorGetDecks,
  mirrorPutCards,
  mirrorPutDecks,
  mirrorPutReviewLog,
} from './localMirror';
import { enqueue } from './outbox';
import { defaultSettings, makeCard, makeDeck, newFsrsFields, newSm2Fields } from './factories';
import { getQueryData, invalidate, refetchKeys, setQueryData } from './store';
import { pushToast } from '../lib/toast';
import { startOfLocalDay } from '../lib/date';
import { levelForXp } from '../features/gamification/xp';
import type { KiokuRepository } from './repositories';
import type {
  AchievementUnlock,
  Algorithm,
  AppSettings,
  ButtonCount,
  Card,
  CardInput,
  CardState,
  DailyProgress,
  Deck,
  DeckCountSet,
  DeckInput,
  FsrsFields,
  GamificationState,
  MediaBlob,
  Rating,
  ReviewLog,
  Sm2Fields,
  XpResult,
} from './types';

const DEFAULT_TTS_LANG = 'en-US';

/* ------------------------------------------------------------ conversions -- */
const toEpoch = (iso: string | null | undefined): number =>
  iso ? new Date(iso).getTime() : 0;
const toIso = (ms: number): string => new Date(ms).toISOString();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await delay(300 * (i + 1));
    }
  }
  throw lastErr;
}

function readFail(error: unknown): never {
  // eslint-disable-next-line no-console
  console.error('[supabase read]', error);
  throw new Error('Não foi possível carregar. Tente novamente.');
}
function writeFail(error: unknown, msg = 'Não foi possível salvar. Tente novamente.'): never {
  // eslint-disable-next-line no-console
  console.error('[supabase write]', error);
  pushToast('error', msg);
  throw new Error(msg);
}

/** Current authenticated user id — centralizes user_id stamping for inserts. */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Sessão expirada. Entre novamente.');
  const id = data.session?.user?.id;
  if (!id) throw new Error('Você precisa estar conectado.');
  return id;
}

/**
 * Pragmatic "is this a CONNECTIVITY failure?" check — so reads can fall back to the
 * local mirror ONLY when offline, never for auth errors or real query bugs (those
 * must still surface). True when the browser reports offline, or the error (thrown
 * OR returned in PostgREST's `error` field) looks like a fetch/network failure.
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

/**
 * Offline replacement for dueQueueCards: read the deck's cards from the mirror and
 * compute the due queue LOCALLY with the SAME filtering/ordering the server query
 * uses — due learning/relearning (ungated), due reviews (earliest-first, capped),
 * then new cards (creation order, capped). Empty if the deck isn't mirrored yet.
 */
async function localDueQueueFromMirror(
  deckId: string,
  reviewLimit: number,
  newLimit: number,
  nowMs: number,
): Promise<Card[]> {
  const all = await mirrorGetCards(deckId);
  const learn = all.filter(
    (c) => (c.state === 'learning' || c.state === 'relearning') && c.due <= nowMs,
  );
  const review = all
    .filter((c) => c.state === 'review' && c.due <= nowMs)
    .sort((a, b) => a.due - b.due)
    .slice(0, reviewLimit);
  const fresh = all
    .filter((c) => c.state === 'new')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, newLimit);
  return [...learn, ...review, ...fresh];
}

/* -------------------------------------------------------------- row types -- */
interface DeckRow {
  id: string;
  name: string;
  color: string;
  category: string | null;
  algorithm: Algorithm;
  new_per_day: number;
  reviews_per_day: number;
  desired_retention: number;
  button_count: ButtonCount;
  created_at: string;
}
interface CardRow {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  state: CardState;
  due: string;
  sm2: Sm2Fields;
  fsrs: FsrsFields;
  created_at: string;
  updated_at: string;
  // Nullable; absent entirely on DBs where the migration has not been run yet.
  audio_path?: string | null;
}
interface LogRow {
  id: string;
  card_id: string;
  deck_id: string;
  rating: Rating;
  reviewed_at: string;
  duration_ms: number;
  prev_state: CardState;
  scheduled_days: number;
}

/* ---------------------------------------------------------------- mappers -- */
function deckToRow(d: Deck, userId: string) {
  return {
    id: d.id,
    user_id: userId,
    name: d.name,
    color: d.color,
    category: d.category ?? null,
    algorithm: d.algorithm,
    new_per_day: d.newPerDay,
    reviews_per_day: d.reviewsPerDay,
    desired_retention: d.desiredRetention,
    button_count: d.buttonCount,
    created_at: toIso(d.createdAt),
  };
}
function deckPatchToRow(patch: Partial<Deck>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.category !== undefined) row.category = patch.category ?? null;
  if (patch.algorithm !== undefined) row.algorithm = patch.algorithm;
  if (patch.newPerDay !== undefined) row.new_per_day = patch.newPerDay;
  if (patch.reviewsPerDay !== undefined) row.reviews_per_day = patch.reviewsPerDay;
  if (patch.desiredRetention !== undefined) row.desired_retention = patch.desiredRetention;
  if (patch.buttonCount !== undefined) row.button_count = patch.buttonCount;
  if (patch.createdAt !== undefined) row.created_at = toIso(patch.createdAt);
  return row; // ttsLang intentionally not persisted (no column)
}
function rowToDeck(r: DeckRow): Deck {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    category: r.category ?? undefined,
    algorithm: r.algorithm,
    createdAt: toEpoch(r.created_at),
    newPerDay: r.new_per_day,
    reviewsPerDay: r.reviews_per_day,
    desiredRetention: r.desired_retention,
    buttonCount: r.button_count,
    ttsLang: DEFAULT_TTS_LANG,
  };
}

function cardToRow(c: Card, userId: string) {
  const row: Record<string, unknown> = {
    id: c.id,
    deck_id: c.deckId,
    user_id: userId,
    front: c.front,
    back: c.back,
    state: c.state,
    due: toIso(c.due),
    sm2: c.sm2,
    fsrs: c.fsrs,
    created_at: toIso(c.createdAt),
    updated_at: toIso(c.updatedAt),
  };
  // Only send audio_path when set, so inserts/upserts keep working on databases
  // where the audio_path column migration has not been run yet.
  if (c.audioPath) row.audio_path = c.audioPath;
  return row;
}
function rowToCard(r: CardRow): Card {
  return {
    id: r.id,
    deckId: r.deck_id,
    front: r.front,
    back: r.back,
    state: r.state,
    due: toEpoch(r.due),
    sm2: r.sm2,
    fsrs: r.fsrs,
    createdAt: toEpoch(r.created_at),
    updatedAt: toEpoch(r.updated_at),
    audioPath: r.audio_path ?? null,
  };
}

function logToRow(l: ReviewLog, userId: string) {
  return {
    id: l.id,
    card_id: l.cardId,
    deck_id: l.deckId,
    user_id: userId,
    rating: l.rating,
    reviewed_at: toIso(l.reviewedAt),
    duration_ms: l.durationMs,
    prev_state: l.prevState,
    scheduled_days: l.scheduledDays,
  };
}
function rowToLog(r: LogRow): ReviewLog {
  return {
    id: r.id,
    cardId: r.card_id,
    deckId: r.deck_id,
    rating: r.rating,
    reviewedAt: toEpoch(r.reviewed_at),
    durationMs: r.duration_ms,
    prevState: r.prev_state,
    scheduledDays: r.scheduled_days,
  };
}

/* ============================================================ repository == */
// Explicit column lists (never `select=*`): a card carries heavy HTML + inline
// audio in front/back, so we only ever pull those columns when we actually render
// a card (review / card list), and name the light columns elsewhere.
const CARD_COLS = 'id, deck_id, front, back, state, due, sm2, fsrs, created_at, updated_at, audio_path';
const LOG_COLS = 'id, card_id, deck_id, rating, reviewed_at, duration_ms, prev_state, scheduled_days';
const DECK_COLS =
  'id, name, color, category, algorithm, new_per_day, reviews_per_day, desired_retention, button_count, created_at';

/** Refresh ONLY the (non-live) card-row queries (deck card table / Stats) after a
 *  card mutation. A REVIEW write deliberately does NOT call this, so saving a
 *  review never re-downloads a deck's cards. */
function refreshCardQueries(): void {
  refetchKeys((k) => k.startsWith('cards:'));
}

// Cap for a single review session pulled from the server, so an unlimited deck
// with a huge backlog can't drag the whole deck into memory. Normal (capped)
// decks never hit this — their daily limit is smaller.
const REVIEW_SESSION_CAP = 5000;

export class SupabaseRepository implements KiokuRepository {
  // ---------------------------------------------------------------- decks --
  async listDecks(): Promise<Deck[]> {
    try {
      const { data, error } = await supabase
        .from('decks')
        .select(DECK_COLS)
        .order('created_at', { ascending: true });
      if (error) {
        if (isNetworkError(error)) return await mirrorGetDecks(); // offline → mirror
        readFail(error); // real error: surface as before
      }
      const decks = ((data ?? []) as unknown as DeckRow[]).map(rowToDeck);
      void mirrorPutDecks(decks); // offline-first: keep a local copy (fire-and-forget)
      return decks;
    } catch (err) {
      if (isNetworkError(err)) return await mirrorGetDecks(); // thrown fetch failure → mirror
      throw err;
    }
  }
  async getDeck(id: string): Promise<Deck | undefined> {
    const { data, error } = await supabase.from('decks').select(DECK_COLS).eq('id', id).maybeSingle();
    if (error) readFail(error);
    return data ? rowToDeck(data as unknown as DeckRow) : undefined;
  }
  async createDeck(input: DeckInput): Promise<Deck> {
    const deck = makeDeck(input);
    const userId = await currentUserId();
    const { error } = await supabase.from('decks').insert(deckToRow(deck, userId));
    if (error) writeFail(error);
    invalidate();
    return deck;
  }
  async updateDeck(id: string, patch: Partial<Deck>): Promise<void> {
    const { error } = await supabase.from('decks').update(deckPatchToRow(patch)).eq('id', id);
    if (error) writeFail(error);
    invalidate();
  }
  async deleteDeck(id: string): Promise<void> {
    const del = async (table: 'review_logs' | 'cards' | 'decks', col: string) => {
      const { error } = await supabase.from(table).delete().eq(col, id);
      if (error) writeFail(error, 'Não foi possível excluir. Tente novamente.');
    };
    // Children first — no assumption about FK cascade.
    await del('review_logs', 'deck_id');
    await del('cards', 'deck_id');
    await del('decks', 'id');
    invalidate();
    refreshCardQueries();
  }
  async resetDeck(id: string): Promise<void> {
    const now = Date.now();
    // Every card becomes "new" with fresh SM-2/FSRS memory state…
    const row = {
      state: 'new' as CardState,
      due: toIso(now),
      sm2: newSm2Fields(),
      fsrs: newFsrsFields(),
      updated_at: toIso(now),
    };
    const cardRes = await supabase.from('cards').update(row).eq('deck_id', id);
    if (cardRes.error) writeFail(cardRes.error, 'Não foi possível reiniciar o deck. Tente novamente.');
    // …and only TODAY's logs are cleared, so the daily new/review counter resets
    // and the deck can be studied again today. Older history is KEPT so resetting
    // a deck never erases your activity record (streak, heatmap, global stats).
    const logRes = await supabase
      .from('review_logs')
      .delete()
      .eq('deck_id', id)
      .gte('reviewed_at', toIso(startOfLocalDay()));
    if (logRes.error) writeFail(logRes.error, 'Não foi possível reiniciar o deck. Tente novamente.');
    invalidate();
    refreshCardQueries();
  }

  // ---------------------------------------------------------------- cards --
  async listCards(deckId: string): Promise<Card[]> {
    // Page through so decks with more than the API's ~1000-row cap still return
    // every card (otherwise counts/lists silently truncate on big decks).
    const PAGE = 1000;
    const rows: CardRow[] = [];
    try {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('cards')
          .select(CARD_COLS)
          .eq('deck_id', deckId)
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          if (isNetworkError(error)) return await mirrorGetCards(deckId); // offline → mirror
          readFail(error); // real error: surface as before
        }
        const batch = (data ?? []) as unknown as CardRow[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      const cards = rows.map(rowToCard);
      void mirrorPutCards(cards); // offline-first: keep a local copy (fire-and-forget)
      return cards;
    } catch (err) {
      if (isNetworkError(err)) return await mirrorGetCards(deckId); // thrown fetch failure → mirror
      throw err;
    }
  }
  async getCard(id: string): Promise<Card | undefined> {
    const { data, error } = await supabase.from('cards').select(CARD_COLS).eq('id', id).maybeSingle();
    if (error) readFail(error);
    return data ? rowToCard(data as CardRow) : undefined;
  }
  async allCards(): Promise<Card[]> {
    // Page through so we never silently drop cards past the API's ~1000-row cap.
    // NOTE: prefer deckListCounts() / dueQueueCards() — this whole-table pull is
    // only for the few screens that still need card-level data (kept off startup).
    const PAGE = 1000;
    const rows: CardRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('cards')
        .select(CARD_COLS)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) readFail(error);
      const batch = (data ?? []) as unknown as CardRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return rows.map(rowToCard);
  }
  /**
   * Per-deck counts for the user in ONE round trip (the deck_counts() RPC). No
   * card rows; the server computes new / learning / review-due / any-due / total
   * per deck. A LIVE query → it refreshes cheaply after a review write.
   */
  async deckCounts(): Promise<Record<string, DeckCountSet>> {
    // ONE round trip: the deck_counts() RPC returns a row per deck (for auth.uid())
    // with every count computed server-side. No card rows, no N×5 fan-out. Decks
    // with zero cards are absent → the client treats a missing id as all-zeros.
    const { data, error } = await supabase.rpc('deck_counts');
    if (error) readFail(error);
    const rows = (data ?? []) as Array<{
      deck_id: string;
      new_count: number | string;
      learning_count: number | string;
      due_review_count: number | string;
      due_any_count: number | string;
      total_count: number | string;
    }>;
    const out: Record<string, DeckCountSet> = {};
    for (const r of rows) {
      out[r.deck_id] = {
        newCount: Number(r.new_count),
        learning: Number(r.learning_count),
        reviewDue: Number(r.due_review_count),
        due: Number(r.due_any_count),
        total: Number(r.total_count),
      };
    }
    // A deck with new_per_day = 0 shows ZERO new cards today — never the raw
    // count of new-state cards. The current deck_counts() already clamps this, but
    // enforce it client-side too so a stale/older deployed deck_counts() (which
    // returned the unclamped new-state count) can't surface e.g. "20 new" on a
    // new_per_day=0 deck. 0 is an intentional value, NOT "unset" → default. This
    // is the single source for every deck-list count (Home, Decks, DeckDetail).
    const decks = getQueryData<Deck[]>('decks') ?? (await this.listDecks());
    for (const d of decks) {
      if (d.newPerDay === 0 && out[d.id]) out[d.id].newCount = 0;
    }
    return out;
  }
  /**
   * The cards a review session actually needs from ONE deck: due learning/
   * relearning (ungated), due reviews (earliest-first, capped), and new cards
   * (insertion order, capped). Never pulls the whole deck. Caps are finite (the
   * caller resolves "unlimited" to REVIEW_SESSION_CAP).
   */
  async dueQueueCards(
    deckId: string,
    opts: { reviewLimit: number; newLimit: number; nowMs: number },
  ): Promise<Card[]> {
    const nowIso = toIso(opts.nowMs);
    const reviewLimit = Math.max(0, Math.min(opts.reviewLimit, REVIEW_SESSION_CAP));
    const newLimit = Math.max(0, Math.min(opts.newLimit, REVIEW_SESSION_CAP));
    try {
      const base = () => supabase.from('cards').select(CARD_COLS).eq('deck_id', deckId);
      const [learnRes, reviewRes, newRes] = await Promise.all([
        base().in('state', ['learning', 'relearning']).lte('due', nowIso),
        reviewLimit > 0
          ? base().eq('state', 'review').lte('due', nowIso).order('due', { ascending: true }).limit(reviewLimit)
          : Promise.resolve({ data: [], error: null }),
        newLimit > 0
          ? base().eq('state', 'new').order('created_at', { ascending: true }).limit(newLimit)
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [learnRes, reviewRes, newRes]) {
        if (r.error) {
          // offline → compute the queue locally from the mirror
          if (isNetworkError(r.error)) {
            return await localDueQueueFromMirror(deckId, reviewLimit, newLimit, opts.nowMs);
          }
          readFail(r.error); // real error: surface as before
        }
      }
      const rows = [
        ...((learnRes.data ?? []) as unknown as CardRow[]),
        ...((reviewRes.data ?? []) as unknown as CardRow[]),
        ...((newRes.data ?? []) as unknown as CardRow[]),
      ];
      const cards = rows.map(rowToCard);
      // offline-first: mirror the pulled cards so a later OFFLINE session can build
      // this queue locally even for users who only ever review (never list a deck).
      void mirrorPutCards(cards);
      return cards;
    } catch (err) {
      if (isNetworkError(err)) {
        return await localDueQueueFromMirror(deckId, reviewLimit, newLimit, opts.nowMs);
      }
      throw err;
    }
  }
  async createCard(input: CardInput): Promise<Card> {
    const card = makeCard(input);
    try {
      const userId = await currentUserId();
      const { error } = await supabase.from('cards').insert(cardToRow(card, userId));
      if (error) throw error;
      invalidate();
      refreshCardQueries();
      void mirrorPutCards([card]); // offline-first: keep a local copy (fire-and-forget)
      return card;
    } catch (err) {
      // Offline / write failed: SOFT path — don't hard-fail the UI. Queue the
      // insert for a later replay, make the card locally visible (mirror), and
      // return the optimistic card so the user keeps going.
      // eslint-disable-next-line no-console
      console.error('[supabase createCard] queued offline', err);
      void enqueue('createCard', card.id, { card });
      void mirrorPutCards([card]);
      return card;
    }
  }
  async bulkInsertCards(cards: Card[]): Promise<void> {
    if (cards.length === 0) return;
    const userId = await currentUserId();
    // Insert in batches so a large import (100MB+ collections -> thousands of
    // cards, some carrying inline image data URLs) never sends one oversized
    // request that the API/proxy could reject or time out on.
    const BATCH = 250;
    for (let i = 0; i < cards.length; i += BATCH) {
      const slice = cards.slice(i, i + BATCH).map((c) => cardToRow(c, userId));
      const { error } = await supabase.from('cards').insert(slice);
      if (error) writeFail(error);
    }
    invalidate();
    refreshCardQueries();
  }
  async seedDeckWithCards(deck: Deck, cards: Card[]): Promise<void> {
    // First-run seed persistence: insert the deck and its cards as ONE unit with
    // a SINGLE invalidate at the END (in `finally`, so even a partial failure
    // reconciles the optimistic cache against the server's real state). Deck
    // first — the cards carry its id.
    const userId = await currentUserId();
    try {
      const { error: deckErr } = await supabase.from('decks').insert(deckToRow(deck, userId));
      if (deckErr) writeFail(deckErr);
      if (cards.length > 0) {
        const rows = cards.map((c) => cardToRow(c, userId));
        const { error: cardErr } = await supabase.from('cards').insert(rows);
        if (cardErr) writeFail(cardErr);
      }
    } finally {
      invalidate();
      refreshCardQueries();
    }
  }
  async updateCard(id: string, patch: Partial<Card>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.front !== undefined) row.front = patch.front;
    if (patch.back !== undefined) row.back = patch.back;
    if (patch.state !== undefined) row.state = patch.state;
    if (patch.due !== undefined) row.due = toIso(patch.due);
    if (patch.sm2 !== undefined) row.sm2 = patch.sm2;
    if (patch.fsrs !== undefined) row.fsrs = patch.fsrs;
    if (patch.audioPath !== undefined) row.audio_path = patch.audioPath;
    row.updated_at = toIso(Date.now());
    const { error } = await supabase.from('cards').update(row).eq('id', id);
    if (error) writeFail(error);
    invalidate();
    refreshCardQueries();
  }
  async putCard(card: Card): Promise<void> {
    const userId = await currentUserId();
    const { error } = await supabase.from('cards').upsert(cardToRow(card, userId));
    if (error) writeFail(error);
    invalidate();
    refreshCardQueries();
  }
  async deleteCard(id: string): Promise<void> {
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (error) writeFail(error, 'Não foi possível excluir. Tente novamente.');
    invalidate();
    refreshCardQueries();
  }
  async countCards(deckId: string): Promise<number> {
    const { count, error } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', deckId);
    if (error) readFail(error);
    return count ?? 0;
  }
  async countReviews(): Promise<number> {
    // All-time review total via a HEAD count (no log rows transferred).
    const { count, error } = await supabase
      .from('review_logs')
      .select('id', { count: 'exact', head: true });
    if (error) readFail(error);
    return count ?? 0;
  }
  async countAllCards(): Promise<number> {
    // Total cards across all the user's decks via a HEAD count (no card rows).
    const { count, error } = await supabase
      .from('cards')
      .select('id', { count: 'exact', head: true });
    if (error) readFail(error);
    return count ?? 0;
  }
  async myStreak(): Promise<number> {
    // Server-side current streak (America/Sao_Paulo), no time-window ceiling.
    const { data, error } = await supabase.rpc('my_streak');
    if (error) readFail(error);
    return typeof data === 'number' ? data : 0;
  }

  // --------------------------------------------------------------- review --
  async saveReview(card: Card, log: ReviewLog): Promise<void> {
    // Optimistic: the session UI already advanced. Persist in the background,
    // retrying transient failures; on final failure show a non-blocking toast
    // (the user keeps their place — the queue lives in component state).
    try {
      await withRetry(async () => {
        const userId = await currentUserId();
        const cardRes = await supabase.from('cards').upsert(cardToRow(card, userId));
        if (cardRes.error) throw cardRes.error;
        const logRes = await supabase.from('review_logs').insert(logToRow(log, userId));
        if (logRes.error) throw logRes.error;
      }, 3);
      invalidate();
      // offline-first: mirror the updated card + the new log (fire-and-forget).
      void mirrorPutCards([card]);
      void mirrorPutReviewLog(log);
    } catch (err) {
      // Retries exhausted (likely offline): queue the review so it's durable and
      // can be replayed later. Optimistic UI + toast/log behavior unchanged.
      void enqueue('saveReview', card.id, { card, log });
      // eslint-disable-next-line no-console
      console.error('[supabase saveReview]', err);
      pushToast('error', 'Não foi possível salvar sua revisão. Verifique sua conexão.');
    }
  }
  async undoReview(card: Card, logId: string): Promise<void> {
    try {
      await withRetry(async () => {
        const userId = await currentUserId();
        const cardRes = await supabase.from('cards').upsert(cardToRow(card, userId));
        if (cardRes.error) throw cardRes.error;
        const delRes = await supabase
          .from('review_logs')
          .delete()
          .eq('id', logId)
          .eq('user_id', userId);
        if (delRes.error) throw delRes.error;
      }, 3);
      invalidate();
      // offline-first: mirror the restored card + drop the undone log (fire-and-forget).
      void mirrorPutCards([card]);
      void mirrorDeleteReviewLog(logId);
    } catch (err) {
      // Retries exhausted (likely offline): queue the undo for a later replay.
      void enqueue('undoReview', card.id, { card, logId });
      // eslint-disable-next-line no-console
      console.error('[supabase undoReview]', err);
      pushToast('error', 'Não foi possível desfazer a revisão.');
    }
  }
  async dailyProgress(deckId: string, dayStart: number): Promise<DailyProgress> {
    const { data, error } = await supabase
      .from('review_logs')
      .select('prev_state')
      .eq('deck_id', deckId)
      .gte('reviewed_at', toIso(dayStart));
    if (error) readFail(error);
    let newDone = 0;
    let reviewsDone = 0;
    for (const r of (data ?? []) as Array<{ prev_state: CardState }>) {
      if (r.prev_state === 'new') newDone += 1;
      else if (r.prev_state === 'review') reviewsDone += 1;
    }
    return { newDone, reviewsDone };
  }
  async allLogs(): Promise<ReviewLog[]> {
    // Page through so we never silently drop logs past the API's row cap — the
    // streak/heatmap/stats must see EVERY review, not just the first ~1000.
    const PAGE = 1000;
    const rows: LogRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('review_logs')
        .select(LOG_COLS)
        .order('reviewed_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) readFail(error);
      const batch = (data ?? []) as unknown as LogRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return rows.map(rowToLog);
  }
  async logsSince(ts: number): Promise<ReviewLog[]> {
    const { data, error } = await supabase
      .from('review_logs')
      .select(LOG_COLS)
      .gte('reviewed_at', toIso(ts));
    if (error) readFail(error);
    return ((data ?? []) as unknown as LogRow[]).map(rowToLog);
  }
  async deckLogsSince(deckId: string, ts: number): Promise<ReviewLog[]> {
    const { data, error } = await supabase
      .from('review_logs')
      .select(LOG_COLS)
      .eq('deck_id', deckId)
      .gte('reviewed_at', toIso(ts));
    if (error) readFail(error);
    return ((data ?? []) as unknown as LogRow[]).map(rowToLog);
  }

  // ---------------------------------------------------------------- media --
  // Media remains local (IndexedDB) for now — media sync is a later step.
  getMedia(id: string): Promise<MediaBlob | undefined> {
    return db.media.get(id);
  }
  async putMedia(media: MediaBlob): Promise<void> {
    await db.media.put(media);
  }

  // ------------------------------------------------------------- settings --
  // ----------------------------------------------------------- gamification --
  /** Read the user's XP/level. A missing row (new user) reads as {0, level 1}. */
  async getGamification(): Promise<GamificationState> {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('gamification')
      .select('total_xp, level')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) readFail(error);
    return {
      totalXp: typeof data?.total_xp === 'number' ? data.total_xp : 0,
      level: typeof data?.level === 'number' ? data.level : 1,
    };
  }

  /**
   * Add XP and upsert the new total + level (read-modify-write off the warm
   * cache — single-device safe, see the schema note). Optimistically updates the
   * cache so the UI reflects it instantly; reverts on a failed write. Returns the
   * new state plus whether a level boundary was crossed.
   */
  async addXp(amount: number): Promise<XpResult> {
    const userId = await currentUserId();
    const current = getQueryData<GamificationState>('gamification') ?? (await this.getGamification());
    const totalXp = current.totalXp + Math.max(0, Math.round(amount));
    const level = levelForXp(totalXp);
    const result: XpResult = { totalXp, level, fromLevel: current.level, leveledUp: level > current.level };

    setQueryData<GamificationState>('gamification', { totalXp, level });
    try {
      await withRetry(async () => {
        const { error } = await supabase
          .from('gamification')
          .upsert(
            { user_id: userId, total_xp: totalXp, level, updated_at: toIso(Date.now()) },
            { onConflict: 'user_id' },
          );
        if (error) throw error;
      }, 3);
    } catch (err) {
      // XP is non-critical — don't nag with a toast; just revert the optimistic
      // cache to the pre-write value so the UI stays truthful.
      // eslint-disable-next-line no-console
      console.error('[supabase addXp]', err);
      setQueryData<GamificationState>('gamification', current);
    }
    return result;
  }

  /** Record an achievement unlock; the unique(user_id, key) makes a repeat a
   *  no-op. Returns true only when it was newly unlocked. (Phase 2 scaffold.) */
  async unlockAchievement(key: string): Promise<boolean> {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('achievement_unlocks')
      .upsert(
        { user_id: userId, achievement_key: key },
        { onConflict: 'user_id,achievement_key', ignoreDuplicates: true },
      )
      .select('id');
    if (error) {
      writeFail(error, 'Não foi possível registrar a conquista.');
    }
    const isNew = (data?.length ?? 0) > 0;
    if (isNew) invalidate();
    return isNew;
  }

  /** All of the user's unlocked achievements, oldest first. (Phase 2 scaffold.) */
  async listAchievements(): Promise<AchievementUnlock[]> {
    const { data, error } = await supabase
      .from('achievement_unlocks')
      .select('achievement_key, unlocked_at')
      .order('unlocked_at', { ascending: true });
    if (error) readFail(error);
    const rows = (data ?? []) as Array<{ achievement_key: string; unlocked_at: string }>;
    return rows.map((r) => ({ key: r.achievement_key, unlockedAt: toEpoch(r.unlocked_at) }));
  }

  async getSettings(): Promise<AppSettings> {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, daily_goal, settings')
      .eq('id', userId)
      .maybeSingle();
    if (error) readFail(error);
    const base = defaultSettings();
    const json = (data?.settings ?? {}) as Partial<AppSettings>;
    return {
      ...base,
      ...json,
      tts: { ...base.tts, ...(json.tts ?? {}) },
      id: 'global',
      displayName: (data?.display_name ?? '').toString().trim() || base.displayName,
      dailyGoal: typeof data?.daily_goal === 'number' ? data.daily_goal : base.dailyGoal,
    };
  }
  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const userId = await currentUserId();
    // Merge over the cached value when warm (avoids a round-trip per keystroke).
    const current = getQueryData<AppSettings>('settings') ?? (await this.getSettings());
    const next: AppSettings = {
      ...current,
      ...patch,
      tts: { ...current.tts, ...(patch.tts ?? {}) },
      id: 'global',
    };
    // Optimistic: reflect the change instantly (Settings inputs are controlled
    // by this cache), then persist in the background.
    setQueryData('settings', next);

    // display_name + daily_goal are columns; everything else is the settings jsonb.
    const rest: Record<string, unknown> = { ...next };
    delete rest.id;
    delete rest.displayName;
    delete rest.dailyGoal;
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: next.displayName, daily_goal: next.dailyGoal, settings: rest })
      .eq('id', userId);
    if (error) {
      invalidate(); // revert optimistic value to server truth
      writeFail(error);
    }
    return next;
  }

  // ---------------------------------------------------------- maintenance --
  async resetAll(): Promise<void> {
    const userId = await currentUserId();
    for (const table of ['review_logs', 'cards', 'decks'] as const) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId);
      if (error) writeFail(error, 'Não foi possível apagar os dados. Tente novamente.');
    }
    const d = defaultSettings();
    // Reset preferences but keep the user's display name.
    await this.saveSettings({
      dailyGoal: d.dailyGoal,
      newPerDay: d.newPerDay,
      reviewsPerDay: d.reviewsPerDay,
      defaultAlgorithm: d.defaultAlgorithm,
      defaultDesiredRetention: d.defaultDesiredRetention,
      defaultButtonCount: d.defaultButtonCount,
      tts: d.tts,
      seededAt: null,
    });
    invalidate();
  }
}
