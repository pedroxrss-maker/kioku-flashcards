// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

// Back the app with the in-memory fake supabase client, configured + signed in,
// so the auth gate renders the real shell, seeds this user's decks, and reads
// them back through SupabaseRepository.
vi.mock('../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  return {
    isSupabaseConfigured: true,
    supabase: createFakeSupabase({ userId: 'u1', displayName: 'Pedro' }),
  };
});

// jsdom doesn't implement scrollTo; the app shell calls it to reset scroll on
// every route change. Stub it so that doesn't log "Not implemented" noise.
window.scrollTo = vi.fn();

describe('App smoke test', () => {
  it('gates on auth, then boots, seeds the user\'s decks, and renders the shell', async () => {
    render(<App />);

    // The Kioku wordmark renders in the shell (sidebar + mobile bar).
    expect((await screen.findAllByText('Kioku')).length).toBeGreaterThan(0);

    // First-run per-user seed creates the sample decks in Supabase.
    const decks = await screen.findAllByText(
      /Inglês: Vocabulário Essencial/,
      {},
      { timeout: 8000 },
    );
    expect(decks.length).toBeGreaterThan(0);

    // The dashboard greeting renders with the profile display name (time-of-day
    // greeting, so match any variant). Awaited: the shell shows decks (sidebar)
    // before the data-gate mounts Home.
    expect(
      await screen.findByText(/(Bom dia|Boa tarde|Boa noite), Pedro/, {}, { timeout: 8000 }),
    ).toBeTruthy();
  });
});
