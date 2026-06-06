/**
 * Per-user first-run seed (replaces the old local seed). On login, if the
 * signed-in user has zero decks in Supabase, create two sample decks in THEIR
 * account — one FSRS, one SM-2 — with text-only cards (no media, no em-dashes).
 * Idempotent and de-duped so concurrent mounts (StrictMode) can't double-seed.
 */
import { repo } from './repositories';
import { makeCard } from './factories';
import { invalidate } from './store';
import { ENGLISH_VOCAB, GENERAL } from './seed';

let inFlight: Promise<void> | null = null;

export async function seedForUserIfEmpty(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const decks = await repo.listDecks(); // RLS-scoped to the current user
    if (decks.length > 0) return;

    const english = await repo.createDeck({
      name: 'Inglês: Vocabulário Essencial',
      color: '#1f6dff',
      category: 'Idiomas',
      algorithm: 'fsrs',
      ttsLang: 'en-US',
    });
    const general = await repo.createDeck({
      name: 'Conhecimentos Gerais',
      color: '#ff9d00',
      category: 'Geral',
      algorithm: 'sm2',
      ttsLang: 'pt-BR',
    });

    const cards = [
      ...ENGLISH_VOCAB.map((p) => makeCard({ deckId: english.id, front: p.front, back: p.back })),
      ...GENERAL.map((p) => makeCard({ deckId: general.id, front: p.front, back: p.back })),
    ];
    await repo.bulkInsertCards(cards);
    invalidate();
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
