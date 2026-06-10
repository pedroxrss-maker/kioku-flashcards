import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import type { GeneratedCard } from './cards';

interface GeneratedCardsEditorProps {
  cards: GeneratedCard[];
  onChange: (cards: GeneratedCard[]) => void;
  onConfirm: () => void;
  busy?: boolean;
  confirmLabel?: string;
}

/**
 * Shared editable preview for AI-generated cards (reused by deck generation and
 * the PDF/URL importers). Lets the user edit each front/back, remove cards, add
 * a blank one, then confirm to create the deck.
 */
export function GeneratedCardsEditor({
  cards,
  onChange,
  onConfirm,
  busy = false,
  confirmLabel = 'Criar deck',
}: GeneratedCardsEditorProps) {
  const update = (i: number, patch: Partial<GeneratedCard>) =>
    onChange(cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(cards.filter((_, idx) => idx !== i));
  const add = () => onChange([...cards, { front: '', back: '' }]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="mono text-sm text-muted">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </p>
        <button
          type="button"
          onClick={add}
          className="text-sm text-accent hover:underline inline-flex items-center gap-1"
        >
          <Plus size={14} /> Adicionar card
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
        {cards.map((c, i) => (
          <div key={i} className="surface p-3 flex gap-2 items-start">
            <span className="mono text-[10px] text-muted pt-2 w-6 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
              <textarea
                className="field"
                rows={2}
                value={c.front}
                placeholder="Frente"
                aria-label={`Frente do card ${i + 1}`}
                onChange={(e) => update(i, { front: e.target.value })}
              />
              <textarea
                className="field"
                rows={2}
                value={c.back}
                placeholder="Verso"
                aria-label={`Verso do card ${i + 1}`}
                onChange={(e) => update(i, { back: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remover card ${i + 1}`}
              className="p-1.5 text-muted hover:text-accent transition-colors shrink-0"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="accent" onClick={onConfirm} disabled={busy || cards.length === 0}>
          {busy ? 'Criando...' : `${confirmLabel} (${cards.length})`}
        </Button>
      </div>
    </div>
  );
}
