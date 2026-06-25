import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { repo } from '../../db/repositories';
import { schedulerForDeck } from '../scheduling';
import type { Scheduler, RatingPreview } from '../scheduling';
import { startOfSaoPauloDay } from '../../lib/date';
import {
  PATH_SEP,
  deckPathOf,
  isGroupToken,
  leafName,
  memberDeckIdsForPath,
  pathFromGroupToken,
} from '../../lib/deckTree';
import { buildInitialQueue, reinsertLearning } from './queue';
import { UNLIMITED_PER_DAY } from '../../db/types';
import type { Card, DailyProgress, Deck, Rating } from '../../db/types';

export interface SessionCounters {
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

const ZERO: SessionCounters = { again: 0, hard: 0, good: 0, easy: 0, total: 0 };

export interface ReviewSession {
  loading: boolean;
  /** Display deck for the session header (a real deck, or a synthetic node for a
   *  grouping parent). */
  deck: Deck | null;
  /** The real deck that owns the current card — drives per-card audio/TTS lang.
   *  Same as `deck` for a single-deck session. */
  currentDeck: Deck | null;
  current: Card | null;
  /** The card after `current` (queue[1]), so the UI can prefetch its media. */
  next: Card | null;
  flipped: boolean;
  preview: Record<Rating, RatingPreview> | null;
  counters: SessionCounters;
  position: number;
  total: number;
  done: boolean;
  startedAt: number;
  canUndo: boolean;
  flip: () => void;
  rate: (rating: Rating) => void;
  undo: () => void;
  /** Patch the current (front-of-queue) card in place, e.g. after an inline edit. */
  updateCurrentCard: (patch: Partial<Card>) => void;
}

interface HistoryEntry {
  prevQueue: Card[]; // the exact queue before the rating (rated card at front)
  prevCard: Card; // pre-review card, to restore in the DB
  rating: Rating;
  logId: string;
}

/** Round-robin merge of per-deck queues so a parent session interleaves its
 *  subdecks (Anki-like). A single queue passes through unchanged, so leaf-deck
 *  sessions keep their exact ordering. */
function mergeQueues(queues: Card[][]): Card[] {
  const out: Card[] = [];
  const idx = queues.map(() => 0);
  let remaining = queues.reduce((n, q) => n + q.length, 0);
  while (remaining > 0) {
    for (let i = 0; i < queues.length; i += 1) {
      if (idx[i] < queues[i].length) {
        out.push(queues[i][idx[i]]);
        idx[i] += 1;
        remaining -= 1;
      }
    }
  }
  return out;
}

/** Resolve the review target (a deck id, or a "group:" path token) into the set
 *  of member decks: a leaf is just itself; a parent is itself + all descendants. */
async function resolveMembers(
  target: string,
): Promise<{ display: Deck | null; members: Deck[] }> {
  const allDecks = await repo.listDecks();
  const settings = await repo.getSettings();
  const paths = settings.deckPaths;

  if (isGroupToken(target)) {
    const path = pathFromGroupToken(target);
    const ids = new Set(memberDeckIdsForPath(path, allDecks, paths));
    const members = allDecks.filter((d) => ids.has(d.id));
    if (members.length === 0) return { display: null, members: [] };
    // Synthetic display deck for the grouping header (not persisted).
    const display: Deck = { ...members[0], id: target, name: leafName(path) };
    return { display, members };
  }

  const deck = allDecks.find((d) => d.id === target);
  if (!deck) return { display: null, members: [] };
  // The launched deck itself + its STRICT descendants (path starts with
  // "<path>::"). We intentionally don't match other decks that share the exact
  // same path, so duplicate-named flat decks never pull each other in.
  const prefix = deckPathOf(deck, paths) + PATH_SEP;
  const ids = new Set<string>([deck.id]);
  for (const d of allDecks) {
    if (deckPathOf(d, paths).startsWith(prefix)) ids.add(d.id);
  }
  const members = allDecks.filter((d) => ids.has(d.id));
  return { display: deck, members };
}

/** Drives a full review session for one deck, or for a parent and all of its
 *  descendant subdecks (the union of their due cards). */
export function useReviewSession(deckId: string | undefined): ReviewSession {
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [counters, setCounters] = useState<SessionCounters>(ZERO);
  const [startedAt] = useState(() => Date.now());

  // Per-member-deck scheduler + deck lookups, so each card is scheduled and
  // pronounced with its OWN deck's algorithm/settings even in a parent session.
  const schedulerByDeck = useRef<Map<string, Scheduler>>(new Map());
  const deckById = useRef<Map<string, Deck>>(new Map());
  const queueRef = useRef<Card[]>([]);
  const cardStartRef = useRef<number>(0);
  const historyRef = useRef<HistoryEntry[]>([]);
  const [historyLen, setHistoryLen] = useState(0);

  const setQueueSynced = useCallback((next: Card[]) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCounters(ZERO);
    (async () => {
      if (!deckId) {
        setLoading(false);
        return;
      }
      const { display, members } = await resolveMembers(deckId);
      if (!display || members.length === 0) {
        if (alive) {
          setDeck(null);
          setLoading(false);
        }
        return;
      }

      const now = Date.now();
      // America/Sao_Paulo midnight — the SAME boundary deck_counts() uses for
      // "new studied today", so the served new cards match the dashboard count.
      const dayStart = startOfSaoPauloDay();
      const schedulers = new Map<string, Scheduler>();
      const decksMap = new Map<string, Deck>();
      const perDeckQueues: Card[][] = [];

      // Daily progress for every member first — needed both for each deck's own
      // caps AND to compute the parent's subtree-wide new ceiling below.
      const progress = new Map<string, DailyProgress>();
      for (const m of members) progress.set(m.id, await repo.dailyProgress(m.id, dayStart));

      // Parent new-card ceiling: a study session started from a real PARENT deck
      // (it has descendants) caps the TOTAL new cards across the WHOLE subtree at
      // the PARENT's remaining new_per_day — a subdeck's own new_per_day can never
      // exceed it, and new_per_day=0 admits ZERO new from anywhere. new-studied-
      // today is summed across the subtree (same São Paulo boundary + prev_state
      // accounting as deck_counts()). A leaf, or a pure grouping folder (group
      // token: no own deck/limit), keeps each deck's own limit unchanged.
      const parentCapped =
        !isGroupToken(deckId) && members.length > 1 && display.newPerDay < UNLIMITED_PER_DAY;
      let remainingNewBudget = Infinity;
      if (parentCapped) {
        const newDoneSubtree = members.reduce((n, m) => n + (progress.get(m.id)?.newDone ?? 0), 0);
        remainingNewBudget = Math.max(0, display.newPerDay - newDoneSubtree);
      }

      // Build each member deck's queue with its OWN settings + daily progress, but
      // never exceeding the parent's remaining subtree budget for NEW cards.
      for (const m of members) {
        decksMap.set(m.id, m);
        schedulers.set(m.id, schedulerForDeck(m));
        const dp = progress.get(m.id) ?? { newDone: 0, reviewsDone: 0 };
        // Pull ONLY this deck's due/new cards (capped to today's remaining limits),
        // never the whole deck. buildInitialQueue then orders/shuffles them exactly
        // as before. Unlimited decks pass Infinity; the repo clamps to a sane cap.
        const reviewLimit =
          m.reviewsPerDay >= UNLIMITED_PER_DAY ? Infinity : Math.max(0, m.reviewsPerDay - dp.reviewsDone);
        const ownNewLimit =
          m.newPerDay >= UNLIMITED_PER_DAY ? Infinity : Math.max(0, m.newPerDay - dp.newDone);
        // The parent ceiling only ever LOWERS a member's new limit (Infinity when
        // not a capped parent session), so studying a child directly is unchanged.
        const newLimit = Math.min(ownNewLimit, remainingNewBudget);
        const cards = await repo.dueQueueCards(m.id, { reviewLimit, newLimit, nowMs: now });
        // Spend the parent budget by the new cards this member actually pulled, so
        // later subdecks see the reduced remainder (total subtree new ≤ parent's).
        if (Number.isFinite(remainingNewBudget)) {
          const newPulled = cards.reduce((n, c) => (c.state === 'new' ? n + 1 : n), 0);
          remainingNewBudget = Math.max(0, remainingNewBudget - newPulled);
        }
        perDeckQueues.push(
          buildInitialQueue({ deck: m, cards, newDone: dp.newDone, reviewsDone: dp.reviewsDone, now }),
        );
      }
      if (!alive) return;
      schedulerByDeck.current = schedulers;
      deckById.current = decksMap;
      historyRef.current = [];
      setHistoryLen(0);
      setDeck(display);
      setQueueSynced(mergeQueues(perDeckQueues));
      setFlipped(false);
      cardStartRef.current = performance.now();
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [deckId, setQueueSynced]);

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const currentDeck = current ? deckById.current.get(current.deckId) ?? deck : deck;

  const preview = useMemo(() => {
    if (!current) return null;
    const s = schedulerByDeck.current.get(current.deckId);
    if (!s) return null;
    return s.preview(current, Date.now());
  }, [current]);

  const flip = useCallback(() => setFlipped((f) => !f), []);

  const rate = useCallback(
    (rating: Rating) => {
      const cur = queueRef.current[0];
      if (!cur) return;
      const s = schedulerByDeck.current.get(cur.deckId);
      if (!s) return;
      const now = Date.now();
      const durationMs = Math.max(0, Math.round(performance.now() - cardStartRef.current));
      const { card: updated, log } = s.apply(cur, rating, now, durationMs);
      // Snapshot the exact pre-rating queue so "U" can restore it verbatim.
      historyRef.current.push({ prevQueue: queueRef.current, prevCard: cur, rating, logId: log.id });
      setHistoryLen(historyRef.current.length);
      void repo.saveReview(updated, log);

      setCounters((c) => ({ ...c, [rating]: c[rating] + 1, total: c.total + 1 }));

      const rest = queueRef.current.slice(1);
      const next =
        updated.state === 'learning' || updated.state === 'relearning'
          ? reinsertLearning(rest, updated)
          : rest;
      setQueueSynced(next);
      setFlipped(false);
      cardStartRef.current = performance.now();
    },
    [setQueueSynced],
  );

  /** Undo the last rating: bring the previous card back (even if it graduated),
   *  restore its pre-review state in the DB and roll back the counters. */
  const undo = useCallback(() => {
    const h = historyRef.current.pop();
    setHistoryLen(historyRef.current.length);
    if (!h) return;
    setQueueSynced(h.prevQueue);
    setCounters((c) => ({
      ...c,
      [h.rating]: Math.max(0, c[h.rating] - 1),
      total: Math.max(0, c.total - 1),
    }));
    void repo.undoReview(h.prevCard, h.logId);
    setFlipped(false);
    cardStartRef.current = performance.now();
  }, [setQueueSynced]);

  const updateCurrentCard = useCallback(
    (patch: Partial<Card>) => {
      const q = queueRef.current;
      if (!q.length) return;
      setQueueSynced([{ ...q[0], ...patch }, ...q.slice(1)]);
    },
    [setQueueSynced],
  );

  const done = !loading && !current;
  const position = counters.total + (current ? 1 : 0);
  const total = counters.total + queue.length;

  return {
    loading,
    deck,
    currentDeck,
    current,
    next,
    flipped,
    preview,
    counters,
    position,
    total,
    done,
    startedAt,
    canUndo: historyLen > 0,
    flip,
    rate,
    undo,
    updateCurrentCard,
  };
}
