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
        <Routes>
          <Route path="/review/:deckId" element={<ReviewSession />} />
        </Routes>
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
        <Routes>
          <Route path="/review/:deckId" element={<ReviewSession />} />
        </Routes>
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
});
