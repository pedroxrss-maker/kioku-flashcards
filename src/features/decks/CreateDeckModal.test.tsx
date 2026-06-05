// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateDeckModal } from './CreateDeckModal';

describe('CreateDeckModal algorithm select', () => {
  it('reveals FSRS retention by default and hides it for SM-2', () => {
    render(
      <MemoryRouter>
        <CreateDeckModal open onClose={() => {}} />
      </MemoryRouter>,
    );

    // FSRS is the default selection -> the config block is visible.
    expect(screen.getByText('Configurações FSRS')).toBeTruthy();
    expect(screen.getByText('Retenção desejada')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();

    // Selecting SM-2 hides the FSRS config entirely.
    fireEvent.click(screen.getByText('SM-2'));
    expect(screen.queryByText('Configurações FSRS')).toBeNull();

    // Back to FSRS -> revealed again.
    fireEvent.click(screen.getByText('FSRS'));
    expect(screen.getByText('Configurações FSRS')).toBeTruthy();
  });
});
