import { useLiveQuery } from 'dexie-react-hooks';
import { repo } from './repositories';
import type { AppSettings, Card, Deck, ReviewLog } from './types';

/**
 * Reactive read hooks. The query bodies call through the repository (not Dexie
 * directly), but Dexie's live-query observes the tables they touch, so the UI
 * stays reactive to writes. A non-Dexie backend would replace these.
 */
export function useDecks(): Deck[] {
  return useLiveQuery(() => repo.listDecks(), [], []);
}

export function useDeck(id: string | undefined): Deck | undefined {
  return useLiveQuery(
    () => (id ? repo.getDeck(id) : Promise.resolve(undefined)),
    [id],
  );
}

export function useCards(deckId: string | undefined): Card[] {
  return useLiveQuery(
    () => (deckId ? repo.listCards(deckId) : Promise.resolve([])),
    [deckId],
    [],
  );
}

export function useAllCards(): Card[] {
  return useLiveQuery(() => repo.allCards(), [], []);
}

export function useAllLogs(): ReviewLog[] {
  return useLiveQuery(() => repo.allLogs(), [], []);
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => repo.getSettings(), []);
}
