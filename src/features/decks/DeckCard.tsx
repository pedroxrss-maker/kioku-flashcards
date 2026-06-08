import { useNavigate } from 'react-router-dom';
import { Panel } from '../../components/Panel';
import { AlgoBadge } from './AlgoBadge';
import { DeckAvatar } from './deckIcons';
import { countCards } from '../../lib/deckStats';
import type { Card, Deck } from '../../db/types';

interface DeckCardProps {
  deck: Deck;
  cards: Card[];
}

export function DeckCard({ deck, cards }: DeckCardProps) {
  const nav = useNavigate();
  const counts = countCards(cards, Date.now(), deck);
  const pct = counts.total
    ? Math.round((counts.mastered / counts.total) * 100)
    : 0;

  return (
    <Panel
      hoverable
      accentStrip={deck.color}
      onClick={() => nav(`/decks/${deck.id}`)}
      className="p-5 flex flex-col gap-4 h-full"
    >
      <div className="flex items-start gap-3">
        <DeckAvatar deck={deck} size={40} />
        <div className="min-w-0 flex-1">
          {deck.category && (
            <p className="mono text-[10px] text-muted mb-1 truncate">
              {deck.category}
            </p>
          )}
          <h3 className="display text-lg leading-tight">{deck.name}</h3>
        </div>
        <AlgoBadge algorithm={deck.algorithm} className="shrink-0" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm">
          <b className="display text-base">{counts.total}</b>{' '}
          <span className="text-muted">cards</span>
        </span>
        {counts.due > 0 && (
          <span
            className="pill"
            style={{ borderColor: deck.color, color: deck.color, fontSize: 10, padding: '4px 9px' }}
          >
            {counts.due} a revisar
          </span>
        )}
      </div>

      <div className="mt-auto">
        <div className="flex justify-between mono text-[10px] text-muted mb-1.5">
          <span>Dominado</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full" style={{ background: 'var(--line)' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: deck.color }} />
        </div>
      </div>
    </Panel>
  );
}
