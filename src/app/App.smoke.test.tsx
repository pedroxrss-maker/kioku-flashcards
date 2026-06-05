// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App smoke test', () => {
  it('boots, seeds sample data, and renders the shell + a seeded deck', async () => {
    render(<App />);

    // The Kioku wordmark renders in the shell (sidebar + mobile bar).
    expect(screen.getAllByText('Kioku').length).toBeGreaterThan(0);

    // After the async first-run seed + live query, a seeded deck is visible.
    const decks = await screen.findAllByText(
      /Inglês — Vocabulário Essencial/,
      {},
      { timeout: 8000 },
    );
    expect(decks.length).toBeGreaterThan(0);

    // The time-of-day greeting renders on Home.
    expect(
      screen.getByText(/Bom dia|Boa tarde|Boa noite/),
    ).toBeTruthy();
  });
});
