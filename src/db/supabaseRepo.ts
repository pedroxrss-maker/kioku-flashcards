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
import { defaultSettings, makeCard, makeDeck, newFsrsFields, newSm2Fields } from './factories';
import { getQueryData, invalidate, setQueryData } from './store';
import { pushToast } from '../lib/toast';
import { startOfLocalDay } from '../lib/date';
import type { KiokuRepository } from './repositories';
import type {
  Algorithm,
  AppSettings,
  ButtonCount,
  Card,
  CardInput,
  CardState,
  DailyProgress,
  Deck,
  DeckInput,
  FsrsFields,
  MediaBlob,
  Rating,
  ReviewLog,
  Sm2Fields,
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
export class SupabaseRepository implements KiokuRepository {
  // ---------------------------------------------------------------- decks --
  async listDecks(): Promise<Deck[]> {
    const { data, error } = await supabase
      .from('decks')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) readFail(error);
    return ((data ?? []) as DeckRow[]).map(rowToDeck);
  }
  async getDeck(id: string): Promise<Deck | undefined> {
    const { data, error } = await supabase.from('decks').select('*').eq('id', id).maybeSingle();
    if (error) readFail(error);
    return data ? rowToDeck(data as DeckRow) : undefined;
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
  }

  // ---------------------------------------------------------------- cards --
  async listCards(deckId: string): Promise<Card[]> {
    const { data, error } = await supabase.from('cards').select('*').eq('deck_id', deckId);
    if (error) readFail(error);
    return ((data ?? []) as CardRow[]).map(rowToCard);
  }
  async getCard(id: string): Promise<Card | undefined> {
    const { data, error } = await supabase.from('cards').select('*').eq('id', id).maybeSingle();
    if (error) readFail(error);
    return data ? rowToCard(data as CardRow) : undefined;
  }
  async allCards(): Promise<Card[]> {
    const { data, error } = await supabase.from('cards').select('*');
    if (error) readFail(error);
    return ((data ?? []) as CardRow[]).map(rowToCard);
  }
  async createCard(input: CardInput): Promise<Card> {
    const card = makeCard(input);
    const userId = await currentUserId();
    const { error } = await supabase.from('cards').insert(cardToRow(card, userId));
    if (error) writeFail(error);
    invalidate();
    return card;
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
  }
  async putCard(card: Card): Promise<void> {
    const userId = await currentUserId();
    const { error } = await supabase.from('cards').upsert(cardToRow(card, userId));
    if (error) writeFail(error);
    invalidate();
  }
  async deleteCard(id: string): Promise<void> {
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (error) writeFail(error, 'Não foi possível excluir. Tente novamente.');
    invalidate();
  }
  async countCards(deckId: string): Promise<number> {
    const { count, error } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', deckId);
    if (error) readFail(error);
    return count ?? 0;
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
    } catch (err) {
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
    } catch (err) {
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
        .select('*')
        .order('reviewed_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) readFail(error);
      const batch = (data ?? []) as LogRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return rows.map(rowToLog);
  }
  async logsSince(ts: number): Promise<ReviewLog[]> {
    const { data, error } = await supabase
      .from('review_logs')
      .select('*')
      .gte('reviewed_at', toIso(ts));
    if (error) readFail(error);
    return ((data ?? []) as LogRow[]).map(rowToLog);
  }
  async deckLogsSince(deckId: string, ts: number): Promise<ReviewLog[]> {
    const { data, error } = await supabase
      .from('review_logs')
      .select('*')
      .eq('deck_id', deckId)
      .gte('reviewed_at', toIso(ts));
    if (error) readFail(error);
    return ((data ?? []) as LogRow[]).map(rowToLog);
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
