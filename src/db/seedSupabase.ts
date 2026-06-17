/**
 * Per-user first-run seed. On the first authenticated load with zero decks, give
 * the account ONE sample deck ("Conhecimentos Gerais") + its cards.
 *
 * Optimistic + non-blocking: the deck and cards are generated client-side and
 * written to the query cache IMMEDIATELY (setQueryData), so Home is populated
 * instantly without waiting on the network. The real insert then persists in the
 * BACKGROUND via repo.seedDeckWithCards, which does a SINGLE invalidate at the
 * end — reconciling the cache with the server, and (if the insert failed)
 * dropping the optimistic rows so the cache never diverges permanently.
 *
 * Idempotent and de-duped so concurrent mounts (StrictMode) can't double-seed.
 */
import { repo } from './repositories';
import { makeCard, makeDeck } from './factories';
import { getQueryData, setQueryData } from './store';
import { GENERAL } from './seed';
import type { Card, Deck } from './types';

let inFlight: Promise<void> | null = null;

export async function seedForUserIfEmpty(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // Only seed an empty account. Prefer the warm 'decks' cache (the shell's
    // initial load already fetches it) to skip a redundant round-trip; fall back
    // to a network read only when the cache isn't loaded yet.
    const cached = getQueryData<Deck[]>('decks');
    const existing = cached ?? (await repo.listDecks());
    if (existing.length > 0) return;

    const general = makeDeck({
      name: 'Conhecimentos Gerais',
      color: '#ff9d00',
      category: 'Geral',
      algorithm: 'sm2',
      ttsLang: 'pt-BR',
    });
    const cards = GENERAL.map((p) => makeCard({ deckId: general.id, front: p.front, back: p.back }));

    // 1) Optimistic: populate the cache so Home shows the deck + cards instantly.
    //    The UI does not wait on the network for this.
    setQueryData<Deck[]>('decks', [general]);
    setQueryData<Card[]>('cards:all', cards);

    // 2) Persist in the background. seedDeckWithCards invalidates ONCE at the end
    //    (success or failure), which reconciles the cache with the server — so a
    //    failed insert drops the optimistic rows instead of diverging.
    try {
      await repo.seedDeckWithCards(general, cards);
    } catch {
      /* persistence failed; the single invalidate inside already reconciled */
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
