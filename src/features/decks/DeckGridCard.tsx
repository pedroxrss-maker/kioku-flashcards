import { useNavigate } from 'react-router-dom';
import { DeckAvatar } from './deckIcons';
import { countCards } from '../../lib/deckStats';
import type { Card, Deck } from '../../db/types';

/**
 * Mobile-only deck tile: a color-gradient card showing the deck name, its icon,
 * and the three Anki counts (novos / aprendendo / a revisar). Tapping it opens
 * the deck overview — there is no separate "Estudar" button on mobile.
 */
export function DeckGridCard({ deck, cards }: { deck: Deck; cards: Card[] }) {
  const nav = useNavigate();
  const c = countCards(cards, Date.now(), deck);

  return (
    <button
      type="button"
      onClick={() => nav(`/decks/${deck.id}`)}
      title={`Abrir ${deck.name}`}
      className="relative flex flex-col text-left p-3 rounded-[var(--r-lg)] overflow-hidden transition-transform active:scale-[0.98] min-w-0"
      style={{
        minHeight: 116,
        border: `1px solid color-mix(in srgb, ${deck.color} 38%, transparent)`,
        background: `linear-gradient(145deg, color-mix(in srgb, ${deck.color} 34%, var(--surface)) 0%, color-mix(in srgb, ${deck.color} 10%, var(--surface)) 100%)`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold leading-snug line-clamp-2 min-w-0" style={{ fontSize: 15 }}>
          {deck.name}
        </p>
        <DeckAvatar deck={deck} size={30} />
      </div>

      <div className="mt-auto pt-3 flex items-center gap-3 mono">
        <Count value={c.newCount} color="var(--accent-blue)" />
        <Count value={c.learning} color="var(--accent)" />
        <Count value={c.reviewDue} color="var(--accent-green)" />
      </div>
    </button>
  );
}

function Count({ value, color }: { value: number; color: string }) {
  return (
    <span
      className="text-base tabular-nums font-semibold"
      style={{ color: value > 0 ? color : 'var(--line-strong)' }}
    >
      {value}
    </span>
  );
}
