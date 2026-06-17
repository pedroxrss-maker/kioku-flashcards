import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Folder } from 'lucide-react';
import { aggregateCounts, buildDeckTree, deckPathOf, nestDeckPaths } from '../../lib/deckTree';
import type { DeckTreeNode } from '../../lib/deckTree';
import { countCards } from '../../lib/deckStats';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { DeckGridCard, GridCounts, SubdeckToggle } from './DeckGridCard';
import { useNestDrag } from './nestDrag';
import type { Card, Deck } from '../../db/types';

/**
 * Mobile-only deck grid, hierarchy-aware. Two INDEPENDENT columns (masonry): a
 * deck (or folder) with subdecks expands a nested list directly below it, IN ITS
 * OWN COLUMN, so the sibling in the other column stays put on the same line. The
 * reveal/hide slides smoothly. While searching it flattens to matching decks.
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
  // Re-parent a deck (drag source) under a target path, persisting deckPaths.
  const onNest = useCallback(
    (dragPath: string, targetPath: string) => {
      const next = nestDeckPaths(decks, deckPaths, dragPath, targetPath);
      if (next) void repo.saveSettings({ deckPaths: next });
    },
    [decks, deckPaths],
  );
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
      <TwoColumns
        items={matches}
        render={(d) => (
          <DeckGridCard
            key={d.id}
            deck={d}
            counts={countCards(cardsByDeck.get(d.id) ?? [], now, d)}
            nestPath={deckPathOf(d, deckPaths)}
            onNest={onNest}
          />
        )}
      />
    );
  }

  const top = maxRows ? roots.slice(0, maxRows) : roots;
  return (
    <TwoColumns
      items={top}
      render={(node) => (
        <GridNode
          key={node.path}
          node={node}
          now={now}
          expandedSet={expanded}
          toggle={toggle}
          onNest={onNest}
        />
      )}
    />
  );
}

/** Two equal, independent columns (masonry): each grows on its own, so an
 *  expanded card never pushes the other column. Items alternate left/right to
 *  keep a natural top-to-bottom reading order. */
function TwoColumns<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const left: T[] = [];
  const right: T[] = [];
  items.forEach((it, i) => (i % 2 === 0 ? left : right).push(it));
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-3">{left.map(render)}</div>
      <div className="flex-1 min-w-0 flex flex-col gap-3">{right.map(render)}</div>
    </div>
  );
}

function GridNode({
  node,
  now,
  expandedSet,
  toggle,
  onNest,
}: {
  node: DeckTreeNode;
  now: number;
  expandedSet: Set<string>;
  toggle: (path: string) => void;
  onNest: (dragPath: string, targetPath: string) => void;
}) {
  const reduce = useReducedMotion();
  const counts = aggregateCounts(node, now);
  const hasKids = node.children.length > 0;
  const open = expandedSet.has(node.path);

  if (!hasKids) {
    return node.deck ? (
      <DeckGridCard deck={node.deck} counts={counts} nestPath={node.path} onNest={onNest} />
    ) : null;
  }

  // Parent (deck or pure folder): the tile, with its subdecks revealed below it
  // within this column (smooth height slide). The tile keeps its normal width.
  return (
    <div className="flex flex-col">
      {node.deck ? (
        <DeckGridCard
          deck={node.deck}
          counts={counts}
          subdeckCount={node.children.length}
          expanded={open}
          onToggleSubdecks={() => toggle(node.path)}
          nestPath={node.path}
          onNest={onNest}
        />
      ) : (
        <FolderCard
          node={node}
          counts={counts}
          expanded={open}
          onToggle={() => toggle(node.path)}
          onNest={onNest}
        />
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="sub"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="flex flex-col gap-3 pt-3 pl-2"
              style={{ borderLeft: '2px solid var(--line)' }}
            >
              {node.children.map((child) => (
                <GridNode
                  key={child.path}
                  node={child}
                  now={now}
                  expandedSet={expandedSet}
                  toggle={toggle}
                  onNest={onNest}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A pure grouping folder (no own deck) as a neutral tile that only expands. */
function FolderCard({
  node,
  counts,
  expanded,
  onToggle,
  onNest,
}: {
  node: DeckTreeNode;
  counts: ReturnType<typeof aggregateCounts>;
  expanded: boolean;
  onToggle: () => void;
  onNest: (dragPath: string, targetPath: string) => void;
}) {
  // Folders are drop targets only (you nest decks INTO them); never dragged.
  const { nestProps, isTarget } = useNestDrag({
    path: node.path,
    label: node.name,
    enabled: false,
    onDrop: onNest,
  });
  return (
    <div
      {...nestProps}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onToggle();
      }}
      className="relative flex flex-col text-left p-3 rounded-[var(--r-lg)] overflow-hidden min-w-0 cursor-pointer"
      style={{
        minHeight: 104,
        background: isTarget ? 'var(--surface)' : 'var(--surface-2)',
        border: isTarget ? '2px solid var(--accent)' : '1px solid var(--line)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold leading-snug line-clamp-2 min-w-0" style={{ fontSize: 13 }}>
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
