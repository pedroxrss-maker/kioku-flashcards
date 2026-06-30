// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CardEditorModal } from './CardEditorModal';
import { makeCard } from '../../db/factories';

describe('CardEditorModal preview', () => {
  it('toggles between the edit fields and a rendered preview', async () => {
    const card = makeCard({ deckId: 'd1', front: '<b>FrontText</b>', back: 'BackText' });

    // The editor uses useNavigate ("Ver no painel"), so it needs Router context.
    // (useImageQuota degrades gracefully without an AuthProvider.)
    render(
      <MemoryRouter>
        <CardEditorModal open onClose={() => {}} deckId="d1" card={card} />
      </MemoryRouter>,
    );

    // Editing: the Frente/Verso fields are shown.
    expect(screen.getByText('Frente')).toBeTruthy();
    expect(screen.getByText('Verso')).toBeTruthy();

    // Switch to preview -> rendered card content, fields gone, label toggles.
    fireEvent.click(screen.getByText('Pré-visualizar'));
    expect(await screen.findByText('FrontText')).toBeTruthy();
    expect(screen.getByText('BackText')).toBeTruthy();
    // The edit fields fade out (AnimatePresence) before they unmount.
    await waitFor(() => expect(screen.queryByText('Frente')).toBeNull());
    expect(screen.getByText('Voltar a editar')).toBeTruthy();

    // Back to editing -> fields return (unsaved edits preserved by construction).
    fireEvent.click(screen.getByText('Voltar a editar'));
    expect(await screen.findByText('Frente')).toBeTruthy();
    expect(screen.queryByText('Voltar a editar')).toBeNull();
  });
});
