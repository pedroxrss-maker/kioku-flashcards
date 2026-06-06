// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

    // Hero headline (text node split from the accent period).
    expect(screen.getByText(/A cura para o esquecimento/)).toBeTruthy();

    // A real, available-now feature (no "Em breve" badge on these).
    expect(screen.getByText(/Importe do Anki/)).toBeTruthy();
    expect(screen.getByText(/Dois algoritmos: SM-2 e FSRS/)).toBeTruthy();

    // Every coming-soon feature carries a visible "Em breve" badge (5 items).
    expect(screen.getAllByText('Em breve').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText(/Geração de cards por IA/)).toBeTruthy();

    // Primary CTA present.
    expect(screen.getAllByText(/Criar conta/).length).toBeGreaterThan(0);
  });
});
