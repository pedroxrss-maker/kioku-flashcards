import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { RichTextField } from './RichTextField';
import { repo } from '../../db/repositories';
import type { Card } from '../../db/types';

interface CardEditorModalProps {
  open: boolean;
  onClose: () => void;
  deckId: string;
  /** When set, edits this card; otherwise creates a new one. */
  card?: Card | null;
}

function isEmptyHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim().length === 0;
}

export function CardEditorModal({
  open,
  onClose,
  deckId,
  card,
}: CardEditorModalProps) {
  const editing = !!card;
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [nonce, setNonce] = useState(0); // bumped to remount the fields
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFront(card?.front ?? '');
      setBack(card?.back ?? '');
      setNonce((n) => n + 1);
    }
  }, [open, card]);

  const canSave = !isEmptyHtml(front) && !saving;

  async function persist(): Promise<void> {
    if (editing && card) {
      await repo.updateCard(card.id, { front, back });
    } else {
      await repo.createCard({ deckId, front, back });
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await persist();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function saveAndNew() {
    if (!canSave) return;
    setSaving(true);
    try {
      await repo.createCard({ deckId, front, back });
      setFront('');
      setBack('');
      setNonce((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar card' : 'Novo card'}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {!editing && (
            <Button variant="default" onClick={saveAndNew} disabled={!canSave}>
              Salvar e adicionar
            </Button>
          )}
          <Button variant="accent" onClick={save} disabled={!canSave}>
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RichTextField
          key={`front-${nonce}`}
          label="Frente"
          valueHtml={front}
          onChange={setFront}
          autoFocus
        />
        <RichTextField
          key={`back-${nonce}`}
          label="Verso"
          valueHtml={back}
          onChange={setBack}
        />
      </div>
    </Modal>
  );
}
