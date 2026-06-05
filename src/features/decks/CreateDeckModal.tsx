import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { cn } from '../../lib/cn';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { DECK_COLORS } from '../../db/factories';
import type { Algorithm } from '../../db/types';

interface CreateDeckModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateDeckModal({ open, onClose }: CreateDeckModalProps) {
  const settings = useSettings();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState<string>(DECK_COLORS[0]);
  const [algorithm, setAlgorithm] = useState<Algorithm>('fsrs');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setCategory('');
      setColor(DECK_COLORS[0]);
      setAlgorithm(settings?.defaultAlgorithm ?? 'fsrs');
    }
  }, [open, settings]);

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const deck = await repo.createDeck({
        name,
        category: category.trim() || undefined,
        color,
        algorithm,
        newPerDay: settings?.newPerDay,
        reviewsPerDay: settings?.reviewsPerDay,
        desiredRetention: settings?.defaultDesiredRetention,
        buttonCount: settings?.defaultButtonCount,
      });
      onClose();
      nav(`/decks/${deck.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo deck"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={submit} disabled={!name.trim() || saving}>
            Criar deck
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="deck-name">
            Nome
          </label>
          <input
            id="deck-name"
            className="field"
            value={name}
            autoFocus
            placeholder="Ex.: Inglês — Phrasal Verbs"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="deck-cat">
            Categoria (opcional)
          </label>
          <input
            id="deck-cat"
            className="field"
            value={category}
            placeholder="Ex.: Idiomas"
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>

        <div>
          <span className="field-label">Cor</span>
          <div className="flex flex-wrap gap-2">
            {DECK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  'h-8 w-8 transition-transform',
                  color === c ? 'scale-110' : 'opacity-70 hover:opacity-100',
                )}
                style={{
                  background: c,
                  outline: color === c ? '2px solid var(--fg)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Algoritmo</span>
          <div className="grid grid-cols-2 gap-2">
            {(['fsrs', 'sm2'] as Algorithm[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAlgorithm(a)}
                className={cn(
                  'border-2 px-3 py-2.5 text-left transition-colors',
                  algorithm === a
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface)]'
                    : 'border-[color:var(--line)] hover:border-[color:var(--fg)]',
                )}
              >
                <span className="mono text-xs block">
                  {a === 'fsrs' ? 'FSRS' : 'SM-2'}
                </span>
                <span className="text-[11px] text-muted">
                  {a === 'fsrs' ? 'Moderno e eficiente' : 'Clássico (Anki)'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
