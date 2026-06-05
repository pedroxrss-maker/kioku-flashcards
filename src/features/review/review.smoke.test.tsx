// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
});
