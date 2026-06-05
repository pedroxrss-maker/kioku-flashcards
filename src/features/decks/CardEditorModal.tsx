import { useEffect, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { RichTextField } from './RichTextField';
import { CardHtml } from '../media/CardHtml';
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
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (open) {
      setFront(card?.front ?? '');
      setBack(card?.back ?? '');
      setNonce((n) => n + 1);
      setPreviewing(false);
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
      setPreviewing(false);
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
          <Button
            variant="default"
            className="mr-auto"
            icon={previewing ? <Pencil size={15} /> : <Eye size={15} />}
            onClick={() => setPreviewing((p) => !p)}
          >
            {previewing ? 'Voltar a editar' : 'Pré-visualizar'}
          </Button>
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
      {previewing ? (
        <div>
          <p className="field-label">Pré-visualização</p>
          <div
            className="rise"
            style={{
              background: '#ffffff',
              color: '#0f0f0f',
              border: '2px solid var(--fg)',
              boxShadow: '8px 8px 0 var(--fg)',
              padding: '28px 24px',
              textAlign: 'center',
            }}
          >
            <CardHtml
              html={front || '<span style="opacity:.4">(frente vazia)</span>'}
              className="card-content"
            />
            <div className="my-5 h-px w-full" style={{ background: '#0f0f0f22' }} />
            <CardHtml
              html={back || '<span style="opacity:.4">(verso vazio)</span>'}
              className="card-content"
            />
          </div>
        </div>
      ) : (
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
      )}
    </Modal>
  );
}
