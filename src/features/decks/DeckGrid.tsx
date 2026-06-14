import { useMemo, useState } from 'react';
import { Folder } from 'lucide-react';
import { aggregateCounts, buildDeckTree, deckPathOf } from '../../lib/deckTree';
import type { DeckTreeNode } from '../../lib/deckTree';
import { countCards } from '../../lib/deckStats';
import { useSettings } from '../../db/hooks';
import { DeckGridCard, GridCounts, SubdeckToggle } from './DeckGridCard';
import type { Card, Deck } from '../../db/types';

/**
 * Mobile-only 2-column grid of deck tiles, hierarchy-aware: a deck (or pure
 * grouping folder) with subdecks shows a chevron that expands a nested sub-grid
 * below it (the parent goes full-width while open). Tapping a deck card opens its
 * overview. While searching, it flattens to matching decks (no hierarchy), like
 * the desktop tree.
 */
export function DeckGrid({
  decks,
  cardsByDeck,
  query,
  maxRows,
}: {
  decks: Deck[];
  cardsByDeck: Map<string, Card[]>;
  query?: string;
  /** Cap the number of top-level tiles (used on Home). */
  maxRows?: number;
}) {
  const settings = useSettings();
  const deckPaths = settings?.deckPaths;
  const roots = useMemo(
    () => buildDeckTree(decks, deckPaths, cardsByDeck),
    [decks, deckPaths, cardsByDeck],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const now = Date.now();
  const q = query?.toLowerCase().trim() ?? '';

  // Search flattens to matching decks (name or full path), no nesting.
  if (q) {
    const matches = decks.filter((d) => {
      const path = deckPathOf(d, deckPaths);
      return d.name.toLowerCase().includes(q) || path.toLowerCase().includes(q);
    });
    if (matches.length === 0) {
      return (
        <p className="text-muted text-sm text-center py-8">
          Nenhum deck encontrado para “{query}”.
        </p>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-3">
        {matches.map((d) => (
          <DeckGridCard key={d.id} deck={d} counts={countCards(cardsByDeck.get(d.id) ?? [], now, d)} />
        ))}
      </div>
    );
  }

  const top = maxRows ? roots.slice(0, maxRows) : roots;
  return (
    <div className="grid grid-cols-2 gap-3">
      {top.map((node) => (
        <GridNode key={node.path} node={node} now={now} expandedSet={expanded} toggle={toggle} />
      ))}
    </div>
  );
}

function GridNode({
  node,
  now,
  expandedSet,
  toggle,
}: {
  node: DeckTreeNode;
  now: number;
  expandedSet: Set<string>;
  toggle: (path: string) => void;
}) {
  const counts = aggregateCounts(node, now);
  const hasKids = node.children.length > 0;
  const open = expandedSet.has(node.path);

  if (!hasKids) {
    return node.deck ? <DeckGridCard deck={node.deck} counts={counts} /> : null;
  }

  // Parent (deck or pure folder): the tile, plus a nested sub-grid when expanded.
  // While open it spans the full width so the subdecks read as a group below it.
  return (
    <div className={open ? 'col-span-2 flex flex-col gap-3' : ''}>
      {node.deck ? (
        <DeckGridCard
          deck={node.deck}
          counts={counts}
          subdeckCount={node.children.length}
          expanded={open}
          onToggleSubdecks={() => toggle(node.path)}
        />
      ) : (
        <FolderCard node={node} counts={counts} expanded={open} onToggle={() => toggle(node.path)} />
      )}
      {open && (
        <div className="grid grid-cols-2 gap-3 pl-2" style={{ borderLeft: '2px solid var(--line)' }}>
          {node.children.map((child) => (
            <GridNode key={child.path} node={child} now={now} expandedSet={expandedSet} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A pure grouping folder (no own deck) as a neutral tile that only expands. */
function FolderCard({
  node,
  counts,
  expanded,
  onToggle,
}: {
  node: DeckTreeNode;
  counts: ReturnType<typeof aggregateCounts>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onToggle();
      }}
      className="relative flex flex-col text-left p-3 rounded-[var(--r-lg)] overflow-hidden min-w-0 cursor-pointer"
      style={{ minHeight: 116, background: 'var(--surface-2)', border: '1px solid var(--line)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold leading-snug line-clamp-2 min-w-0" style={{ fontSize: 15 }}>
          {node.name}
        </p>
        <span
          className="shrink-0 flex items-center justify-center rounded-[var(--r-sm)]"
          style={{ width: 30, height: 30, background: 'var(--surface)', color: 'var(--muted)' }}
        >
          <Folder size={16} />
        </span>
      </div>
      <div className="mt-auto pt-3 flex items-end justify-between gap-2">
        <GridCounts counts={counts} />
        <SubdeckToggle count={node.children.length} expanded={expanded} onToggle={onToggle} />
      </div>
    </div>
  );
}
