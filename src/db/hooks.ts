import { useQuery } from './store';
import type { QueryResult } from './store';
import { repo } from './repositories';
import type {
  AchievementUnlock,
  AppSettings,
  Card,
  Deck,
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
  const decks = useQuery('decks', () => repo.listDecks(), EMPTY_DECKS);
  const cards = useQuery('cards:all', () => repo.allCards(), EMPTY_CARDS);
  const logs = useQuery('logs:all', () => repo.allLogs(), EMPTY_LOGS);
  const settings = useQuery<AppSettings | undefined>('settings', () => repo.getSettings(), undefined);

  const all = [decks, cards, logs, settings];
  const ready = all.every((q) => q.loaded);
  const error = ready ? null : (all.find((q) => q.error !== undefined)?.error ?? null);
  const reload = () => all.forEach((q) => q.reload());
  return { ready, error, reload };
}
