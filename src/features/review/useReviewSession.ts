import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { repo } from '../../db/repositories';
import { schedulerForDeck } from '../scheduling';
import type { Scheduler, RatingPreview } from '../scheduling';
import { startOfLocalDay } from '../../lib/date';
import { buildInitialQueue, reinsertLearning } from './queue';
import type { Card, Deck, Rating } from '../../db/types';

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
  deck: Deck | null;
  current: Card | null;
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

/** Drives a full review session for one deck. */
export function useReviewSession(deckId: string | undefined): ReviewSession {
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [counters, setCounters] = useState<SessionCounters>(ZERO);
  const [startedAt] = useState(() => Date.now());

  const schedulerRef = useRef<Scheduler | null>(null);
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
      const d = await repo.getDeck(deckId);
      if (!d) {
        if (alive) {
          setDeck(null);
          setLoading(false);
        }
        return;
      }
      const cards = await repo.listCards(deckId);
      const dp = await repo.dailyProgress(deckId, startOfLocalDay());
      const q = buildInitialQueue({
        deck: d,
        cards,
        newDone: dp.newDone,
        reviewsDone: dp.reviewsDone,
        now: Date.now(),
      });
      if (!alive) return;
      schedulerRef.current = schedulerForDeck(d);
      historyRef.current = [];
      setHistoryLen(0);
      setDeck(d);
      setQueueSynced(q);
      setFlipped(false);
      cardStartRef.current = performance.now();
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [deckId, setQueueSynced]);

  const current = queue[0] ?? null;

  const preview = useMemo(() => {
    const s = schedulerRef.current;
    if (!s || !current) return null;
    return s.preview(current, Date.now());
  }, [current]);

  const flip = useCallback(() => setFlipped((f) => !f), []);

  const rate = useCallback(
    (rating: Rating) => {
      const s = schedulerRef.current;
      const cur = queueRef.current[0];
      if (!s || !cur) return;
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
    current,
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
