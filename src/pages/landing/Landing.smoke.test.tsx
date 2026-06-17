// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../features/auth/AuthContext';
import { Landing } from './Landing';

// framer-motion needs these browser APIs, which jsdom does not implement.
beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver = Observer as unknown as typeof window.IntersectionObserver;
  window.ResizeObserver = Observer as unknown as typeof window.ResizeObserver;
});

describe('Landing page', () => {
  it('mounts and renders the hero, live features, and badged coming-soon items', () => {
    // Landing is always rendered under AuthProvider in the app (Pricing reads the
    // auth context for the subscribe flow); the placeholder Supabase client used
    // in tests resolves to no session, i.e. the logged-out landing.
    render(
      <AuthProvider>
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      </AuthProvider>,
    );

    // Hero headline, now uppercase across decorated lines ("A CURA / PARA O / ESQUECIMENTO.").
    expect(screen.getByText('CURA')).toBeTruthy();
    expect(screen.getByText('ESQUECIMENTO')).toBeTruthy();

    // Available-now features in "Recursos", including the AI ones now live.
    expect(screen.getByText(/Importe do Anki/)).toBeTruthy();
    expect(screen.getByText(/Dois algoritmos: SM-2 e FSRS/)).toBeTruthy();
    expect(screen.getByText(/Geração de cards por IA/)).toBeTruthy();
    expect(screen.getByText(/Tutor de IA em cada card/)).toBeTruthy();

    // Coming-soon section: now two badged items (audio transcription + exam sim).
    expect(screen.getAllByText('Em breve').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Transcreva áudios em flashcards/)).toBeTruthy();
    expect(screen.getByText(/Simulador de provas adaptativo/)).toBeTruthy();

    // Primary CTA present.
    expect(screen.getAllByText(/Criar conta/).length).toBeGreaterThan(0);
  });
});
