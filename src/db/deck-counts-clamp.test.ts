import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Locks in the client-side safety net in SupabaseRepository.deckCounts(): a deck
 * whose new_per_day is 0 must report ZERO new cards, even if the deck_counts()
 * RPC (e.g. an older deployed version) returned the RAW count of new-state cards.
 * This is what kept "20 new" on the Home list for a new_per_day=0 deck.
 */
const h = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: async (name: string) =>
      name === 'deck_counts' ? { data: h.rows, error: null } : { data: null, error: null },
  },
}));

import { repo } from './repositories';
import { clearQueryCache, setQueryData } from './store';
import type { Deck } from './types';

function fakeDeck(id: string, newPerDay: number): Deck {
  return {
    id,
    name: id,
    color: '#fff',
    algorithm: 'sm2',
    createdAt: 0,
    newPerDay,
    reviewsPerDay: 200,
    desiredRetention: 0.9,
    buttonCount: 4,
  } as Deck;
}

function rpcRow(deckId: string, newCount: number) {
  return {
    deck_id: deckId,
    new_count: newCount,
    learning_count: 0,
    due_review_count: 0,
    due_any_count: newCount,
    total_count: newCount,
  };
}

describe('deckCounts() — new_per_day=0 clamp', () => {
  beforeEach(() => {
    clearQueryCache();
    h.rows = [];
  });

  it('forces newCount to 0 for a new_per_day=0 deck even if the RPC returns the raw count', async () => {
    // 'decks' cache holds a new_per_day=0 deck and a normal one. The RPC (stale)
    // returns the unclamped raw new-state count (20) for BOTH.
    setQueryData<Deck[]>('decks', [fakeDeck('d-zero', 0), fakeDeck('d-twenty', 20)]);
    h.rows = [rpcRow('d-zero', 20), rpcRow('d-twenty', 20)];

    const counts = await repo.deckCounts();

    expect(counts['d-zero'].newCount).toBe(0); // clamped: new_per_day=0 → 0 new
    expect(counts['d-twenty'].newCount).toBe(20); // untouched: finite limit > 0
    // Other counts are passed through unchanged.
    expect(counts['d-zero'].total).toBe(20);
  });

  it('leaves a correctly-clamped RPC value (0) as 0', async () => {
    setQueryData<Deck[]>('decks', [fakeDeck('d-zero', 0)]);
    h.rows = [rpcRow('d-zero', 0)]; // already-correct deck_counts()
    const counts = await repo.deckCounts();
    expect(counts['d-zero'].newCount).toBe(0);
  });
});
