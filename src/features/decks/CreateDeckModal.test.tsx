// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CreateDeckModal } from './CreateDeckModal';

describe('CreateDeckModal algorithm select', () => {
  it('hides FSRS retention by default (SM-2) and reveals it for FSRS', async () => {
    render(
      <MemoryRouter>
        <CreateDeckModal open onClose={() => {}} />
      </MemoryRouter>,
    );

    // SM-2 is the default selection -> the FSRS config block is hidden.
    expect(screen.queryByText('Configurações FSRS')).toBeNull();

    // Selecting FSRS reveals the config block.
    fireEvent.click(screen.getByText('FSRS'));
    expect(screen.getByText('Configurações FSRS')).toBeTruthy();
    expect(screen.getByText('Retenção desejada')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();

    // Back to SM-2 -> the config block animates out (AnimatePresence exit), so
    // wait for it to be removed rather than asserting synchronously.
    fireEvent.click(screen.getByText('SM-2'));
    await waitForElementToBeRemoved(() => screen.queryByText('Configurações FSRS'));
  });
});
