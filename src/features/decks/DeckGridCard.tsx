import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { DeckAvatar } from './deckIcons';
import type { Deck } from '../../db/types';
import type { DeckCounts } from '../../lib/deckStats';

/** The three Anki counts (novos / aprendendo / a revisar), left-aligned. */
export function GridCounts({ counts }: { counts: DeckCounts }) {
  return (
    <div className="flex items-center gap-3 mono">
      <CountVal value={counts.newCount} color="var(--accent-blue)" />
      <CountVal value={counts.learning} color="var(--accent)" />
      <CountVal value={counts.reviewDue} color="var(--accent-green)" />
    </div>
  );
}

function CountVal({ value, color }: { value: number; color: string }) {
  return (
    <span
      className="text-base tabular-nums font-semibold"
      style={{ color: value > 0 ? color : 'var(--line-strong)' }}
    >
      {value}
    </span>
  );
}

/** Small "N ⌄" control to reveal/hide a deck's subdecks (stops the card's tap). */
export function SubdeckToggle({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={expanded ? 'Ocultar subdecks' : `Mostrar ${count} subdecks`}
      className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-muted hover:text-fg"
    >
      {count}
      <ChevronDown
        size={14}
        style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .16s ease' }}
      />
    </button>
  );
}

/**
 * Mobile deck tile: a color-gradient card with the name, the deck icon, and the
 * three counts. Tapping it opens the deck overview (no "Estudar" button). A deck
 * with subdecks also shows a chevron toggle (handled by the parent grid).
 */
export function DeckGridCard({
  deck,
  counts,
  subdeckCount,
  expanded,
  onToggleSubdecks,
}: {
  deck: Deck;
  counts: DeckCounts;
  subdeckCount?: number;
  expanded?: boolean;
  onToggleSubdecks?: () => void;
}) {
  const nav = useNavigate();
  const open = () => nav(`/decks/${deck.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      title={`Abrir ${deck.name}`}
      className="relative flex flex-col text-left p-3 rounded-[var(--r-lg)] overflow-hidden transition-transform active:scale-[0.98] min-w-0 cursor-pointer"
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

      <div className="mt-auto pt-3 flex items-end justify-between gap-2">
        <GridCounts counts={counts} />
        {subdeckCount ? (
          <SubdeckToggle count={subdeckCount} expanded={!!expanded} onToggle={() => onToggleSubdecks?.()} />
        ) : null}
      </div>
    </div>
  );
}
