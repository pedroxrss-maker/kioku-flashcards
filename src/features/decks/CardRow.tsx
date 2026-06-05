import { useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { Panel } from '../../components/Panel';
import { CardHtml } from '../media/CardHtml';
import { SpeakerButton } from '../tts/SpeakerButton';
import { repo } from '../../db/repositories';
import { cn } from '../../lib/cn';
import { stripHtml } from '../../lib/text';
import type { Card, CardState, Deck } from '../../db/types';

const STATE_LABEL: Record<CardState, string> = {
  new: 'Novo',
  learning: 'Aprendendo',
  review: 'Revisão',
  relearning: 'Reaprendendo',
};
const STATE_COLOR: Record<CardState, string> = {
  new: 'var(--accent-blue)',
  learning: 'var(--accent-amber)',
  review: 'var(--accent-green)',
  relearning: 'var(--accent)',
};

interface CardRowProps {
  card: Card;
  deck: Deck;
  onEdit: () => void;
}

export function CardRow({ card, deck, onEdit }: CardRowProps) {
  const [confirm, setConfirm] = useState(false);

  return (
    <Panel className="p-4 flex gap-3 items-start">
      <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="mono text-[10px] text-muted">Frente</span>
            <SpeakerButton text={stripHtml(card.front)} lang={deck.ttsLang} size={13} />
          </div>
          <CardHtml html={card.front} className="card-content-sm" />
        </div>
        <div
          className="min-w-0 sm:border-l sm:pl-4"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="mono text-[10px] text-muted">Verso</span>
            <SpeakerButton text={stripHtml(card.back)} lang={deck.ttsLang} size={13} />
          </div>
          <CardHtml html={card.back} className="card-content-sm" />
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <span
          className="mono text-[9px] px-2 py-0.5 rounded-full"
          style={{ color: STATE_COLOR[card.state], border: `1px solid ${STATE_COLOR[card.state]}` }}
        >
          {STATE_LABEL[card.state]}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onEdit}
            title="Editar"
            className="p-1.5 text-muted hover:text-fg transition-colors"
          >
            <Pencil size={15} />
          </button>
          {confirm ? (
            <>
              <button
                type="button"
                onClick={() => repo.deleteCard(card.id)}
                title="Confirmar exclusão"
                className={cn('p-1.5 transition-colors')}
                style={{ color: 'var(--accent)' }}
              >
                <Trash2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                title="Cancelar"
                className="p-1.5 text-muted hover:text-fg transition-colors"
              >
                <X size={15} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              title="Excluir"
              className="p-1.5 text-muted hover:text-accent transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
