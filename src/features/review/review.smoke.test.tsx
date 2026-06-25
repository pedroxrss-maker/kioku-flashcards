// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Back the repository with the in-memory fake supabase client (logged in).
vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../../test/fakeSupabase');
  return { supabase: createFakeSupabase(), isSupabaseConfigured: true };
});

import { repo } from '../../db/repositories';
import { ReviewSession } from '../../pages/ReviewSession';
import { ThemeProvider } from '../../theme/theme';

describe('Review session (integration)', () => {
  it('renders a card, flips, shows interval previews, rates, and completes', async () => {
    const deck = await repo.createDeck({
      name: 'Teste',
      color: '#ff3b1f',
      algorithm: 'sm2',
      buttonCount: 4,
    });
    await repo.createCard({ deckId: deck.id, front: '<b>hello</b>', back: 'world' });

    render(
      <MemoryRouter initialEntries={[`/review/${deck.id}`]}>
        <ThemeProvider>
          <Routes>
            <Route path="/review/:deckId" element={<ReviewSession />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // Front + reveal CTA. ('hello' renders on both faces — front + back recap.)
    expect((await screen.findAllByText('hello')).length).toBeGreaterThan(0);
    const reveal = screen.getByText(/Mostrar resposta/);
    expect(reveal).toBeTruthy();

    // Flip -> answer buttons with interval previews appear.
    fireEvent.click(reveal);
    expect(await screen.findByText('Fácil')).toBeTruthy();
    expect(screen.getByText('Errei')).toBeTruthy();
    expect(screen.getByText('Bom')).toBeTruthy();
    // A fresh SM-2 card rated easy schedules 4 days.
    expect(screen.getByText('4 d')).toBeTruthy();

    // Rate easy -> card graduates to review, queue empties -> completion.
    fireEvent.click(screen.getByText('Fácil'));
    expect(await screen.findByText(/Sessão concluída/)).toBeTruthy();
  });

  it('advances to the next card front-first (no back-flash on card change)', async () => {
    const deck = await repo.createDeck({
      name: 'Dois',
      color: '#1f6dff',
      algorithm: 'sm2',
      buttonCount: 4,
    });
    await repo.createCard({ deckId: deck.id, front: 'PERGUNTA UM', back: 'RESP UM' });
    await repo.createCard({ deckId: deck.id, front: 'PERGUNTA DOIS', back: 'RESP DOIS' });

    const { container } = render(
      <MemoryRouter initialEntries={[`/review/${deck.id}`]}>
        <ThemeProvider>
          <Routes>
            <Route path="/review/:deckId" element={<ReviewSession />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // First card starts on its front (not flipped).
    await screen.findByText(/Mostrar resposta/);
    expect(container.querySelector('.flip-inner')?.classList.contains('is-flipped')).toBe(false);

    // Reveal -> flipped.
    fireEvent.click(screen.getByText(/Mostrar resposta/));
    await screen.findByText('Fácil');
    expect(container.querySelector('.flip-inner')?.classList.contains('is-flipped')).toBe(true);

    // Advance: the next card must come up front-first (reveal CTA back, unflipped).
    fireEvent.click(screen.getByText('Fácil'));
    await screen.findByText(/Mostrar resposta/);
    expect(container.querySelector('.flip-inner')?.classList.contains('is-flipped')).toBe(false);
  });

  it('studying a parent deck reviews the union of its descendant subdecks', async () => {
    // Parent "Inglês" (1 card) with child "Inglês::Gramática" (1 card).
    const parent = await repo.createDeck({ name: 'Inglês', color: '#ff3b1f', algorithm: 'sm2', buttonCount: 4 });
    const child = await repo.createDeck({ name: 'Gramática', color: '#1f6dff', algorithm: 'sm2', buttonCount: 4 });
    await repo.saveSettings({
      deckPaths: { [parent.id]: 'Inglês', [child.id]: 'Inglês::Gramática' },
      // The remaining-count is off by default now; enable it so the header shows
      // the "de 2" total this test asserts on (the union of parent + descendant).
      showRemainingCount: true,
    });
    await repo.createCard({ deckId: parent.id, front: 'PAI', back: 'a' });
    await repo.createCard({ deckId: child.id, front: 'FILHO', back: 'b' });

    render(
      <MemoryRouter initialEntries={[`/review/${parent.id}`]}>
        <ThemeProvider>
          <Routes>
            <Route path="/review/:deckId" element={<ReviewSession />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // The session header counts BOTH cards (parent + descendant) = "de 2".
    expect(await screen.findByText(/de 2/)).toBeTruthy();
    // Header still shows the launched parent deck's name.
    expect(screen.getAllByText('Inglês').length).toBeGreaterThan(0);
  });

  it('a new_per_day=0 PARENT suppresses NEW cards from its subdecks during study', async () => {
    // Geografia (new_per_day=0) with subdeck "Bandeiras" (default new_per_day>0)
    // that has new cards. Studying the parent must introduce ZERO new cards.
    const parent = await repo.createDeck({
      name: 'Geografia',
      color: '#fff',
      algorithm: 'sm2',
      newPerDay: 0,
      buttonCount: 4,
    });
    const child = await repo.createDeck({ name: 'Bandeiras', color: '#fff', algorithm: 'sm2', buttonCount: 4 });
    await repo.saveSettings({
      deckPaths: { [parent.id]: 'Geografia', [child.id]: 'Geografia::Bandeiras' },
    });
    await repo.createCard({ deckId: child.id, front: 'BANDEIRA BRASIL', back: 'verde' });
    await repo.createCard({ deckId: child.id, front: 'BANDEIRA ARGENTINA', back: 'azul' });

    render(
      <MemoryRouter initialEntries={[`/review/${parent.id}`]}>
        <ThemeProvider>
          <Routes>
            <Route path="/review/:deckId" element={<ReviewSession />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // The parent's new_per_day=0 caps the whole subtree → no new cards anywhere,
    // so the session is empty.
    expect(await screen.findByText(/Nada para revisar/)).toBeTruthy();
    expect(screen.queryByText('BANDEIRA BRASIL')).toBeNull();
    expect(screen.queryByText('BANDEIRA ARGENTINA')).toBeNull();
  });

  it('a new_per_day=N PARENT caps total NEW across the subtree at N', async () => {
    // Geo (new_per_day=1, no own cards) + subdeck with 3 new cards. Studying the
    // parent introduces only 1 new card total (the parent ceiling), not 3.
    const parent = await repo.createDeck({
      name: 'Geo',
      color: '#fff',
      algorithm: 'sm2',
      newPerDay: 1,
      buttonCount: 4,
    });
    const child = await repo.createDeck({ name: 'Sub', color: '#fff', algorithm: 'sm2', buttonCount: 4 });
    await repo.saveSettings({
      deckPaths: { [parent.id]: 'Geo', [child.id]: 'Geo::Sub' },
      showRemainingCount: true,
    });
    await repo.createCard({ deckId: child.id, front: 'NOVO 1', back: 'a' });
    await repo.createCard({ deckId: child.id, front: 'NOVO 2', back: 'b' });
    await repo.createCard({ deckId: child.id, front: 'NOVO 3', back: 'c' });

    render(
      <MemoryRouter initialEntries={[`/review/${parent.id}`]}>
        <ThemeProvider>
          <Routes>
            <Route path="/review/:deckId" element={<ReviewSession />} />
          </Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );

    // Only ONE new card is introduced across the subtree (parent ceiling = 1),
    // despite the subdeck having 3 and its own limit allowing all 3 → "de 1".
    expect(await screen.findByText(/de 1/)).toBeTruthy();
  });
});
