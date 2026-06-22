import { useQuery } from './store';
import type { QueryResult } from './store';
import { repo } from './repositories';
import { startOfLocalDay, DAY_MS } from '../lib/date';
import type {
  AchievementUnlock,
  AppSettings,
  Card,
  Deck,
  DeckCountSet,
  GamificationState,
  ReviewLog,
} from './types';

/**
 * Reactive read hooks backed by Supabase (via the keyed query store). The public
 * signatures are unchanged from the old Dexie/liveQuery versions, so components
 * keep calling them as-is; reactivity now comes from invalidate() on every write.
 */

const EMPTY_DECKS: Deck[] = [];
const EMPTY_CARDS: Card[] = [];
const EMPTY_LOGS: ReviewLog[] = [];

export function useDecks(): Deck[] {
  return useQuery('decks', () => repo.listDecks(), EMPTY_DECKS).data;
}

export function useDeck(id: string | undefined): Deck | undefined {
  return useDeckResource(id).data;
}

/** Like useDeck but exposes loading/error for the Deck detail page. */
export function useDeckResource(id: string | undefined): QueryResult<Deck | undefined> {
  return useQuery(
    id ? `deck:${id}` : 'deck:none',
    () => (id ? repo.getDeck(id) : Promise.resolve(undefined)),
    undefined,
  );
}

export function useCards(deckId: string | undefined): Card[] {
  return useQuery(
    deckId ? `cards:deck:${deckId}` : 'cards:none',
    () => (deckId ? repo.listCards(deckId) : Promise.resolve(EMPTY_CARDS)),
    EMPTY_CARDS,
  ).data;
}

export function useAllCards(): Card[] {
  return useQuery('cards:all', () => repo.allCards(), EMPTY_CARDS).data;
}

const EMPTY_COUNTS: Record<string, DeckCountSet> = {};

/**
 * Per-deck counts (new / learning / review-due / due / total) for ALL the user's
 * decks, in ONE request (the deck_counts() RPC — no card rows). A deck absent from
 * the map has no cards (callers use `?? emptyCountSet()`). The query key is a fixed
 * string, so it fetches once on mount and only re-runs on invalidate (a real data
 * change), NEVER per render. Consumers index the result by deck id; for a parent
 * deck, aggregate over the subtree's ids client-side (aggregateCountSet).
 */
export function useDeckCounts(): Record<string, DeckCountSet> {
  return useQuery('deckCounts', () => repo.deckCounts(), EMPTY_COUNTS).data;
}

/** All-time review total via a HEAD count (no log rows). */
export function useReviewCount(): number {
  return useQuery('reviews:count', () => repo.countReviews(), 0).data;
}

/** Current streak via the server-side my_streak() RPC — accurate with no
 *  time-window ceiling, no review rows downloaded. */
export function useStreak(): number {
  return useQuery('streak', () => repo.myStreak(), 0).data;
}

/**
 * Reviews from the last `days` days only (bounded window — never the whole log
 * table). Keyed by the day count so it's stable across renders and refetches on
 * write. Used for streak / recent-activity stats off the hot path.
 */
export function useRecentLogs(days: number): ReviewLog[] {
  return useQuery(
    `logs:recent:${days}`,
    () => repo.logsSince(startOfLocalDay() - days * DAY_MS),
    EMPTY_LOGS,
  ).data;
}

/** One deck's reviews from the last `days` days (bounded; for the deck heatmap). */
export function useDeckRecentLogs(deckId: string | undefined, days: number): ReviewLog[] {
  return useQuery(
    deckId ? `logs:deck:${deckId}:${days}` : 'logs:deck:none',
    () =>
      deckId
        ? repo.deckLogsSince(deckId, startOfLocalDay() - days * DAY_MS)
        : Promise.resolve(EMPTY_LOGS),
    EMPTY_LOGS,
  ).data;
}

export function useAllLogs(): ReviewLog[] {
  return useQuery('logs:all', () => repo.allLogs(), EMPTY_LOGS).data;
}

export function useSettings(): AppSettings | undefined {
  return useQuery<AppSettings | undefined>('settings', () => repo.getSettings(), undefined).data;
}

/** The user's XP/level (undefined until first load). Shares the 'gamification'
 *  cache key with repo.addXp, so awarding XP updates this reactively. */
export function useGamification(): GamificationState | undefined {
  return useQuery<GamificationState | undefined>('gamification', () => repo.getGamification(), undefined)
    .data;
}

const EMPTY_ACHIEVEMENTS: AchievementUnlock[] = [];

/** The user's unlocked achievements (key + unlockedAt). Refreshes on invalidate,
 *  so a new unlock from evaluateAchievements() reflects on the Awards page. */
export function useAchievements(): AchievementUnlock[] {
  return useQuery('achievements', () => repo.listAchievements(), EMPTY_ACHIEVEMENTS).data;
}

/**
 * Initial app data load used to gate the shell: waits for the core datasets so
 * pages render with data instead of flashing empty. Shares cache keys with the
 * hooks above, so pages read warm data after the gate resolves.
 */
export function useInitialLoad(): { ready: boolean; error: unknown; reload: () => void } {
  // Startup loads ONLY deck metadata + settings — never card rows or the whole
  // review log. Counts come from server-side HEAD counts (useDeckCounts) and the
  // review session pulls just its due cards, so a 28k-card account no longer
  // bulk-downloads decks on load.
  const decks = useQuery('decks', () => repo.listDecks(), EMPTY_DECKS);
  const settings = useQuery<AppSettings | undefined>('settings', () => repo.getSettings(), undefined);

  const all = [decks, settings];
  const ready = all.every((q) => q.loaded);
  const error = ready ? null : (all.find((q) => q.error !== undefined)?.error ?? null);
  const reload = () => all.forEach((q) => q.reload());
  return { ready, error, reload };
}
