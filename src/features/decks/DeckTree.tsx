import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Folder, MoreVertical, Pencil, Play, Settings2, Trash2 } from 'lucide-react';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { DeckAvatar } from './deckIcons';
import { AlgoBadge } from './AlgoBadge';
import {
  aggregateCounts,
  buildDeckTree,
  deckPathOf,
  groupReviewToken,
  isStudiable,
} from '../../lib/deckTree';
import type { DeckTreeNode } from '../../lib/deckTree';
import type { Card, Deck } from '../../db/types';

interface DeckTreeProps {
  decks: Deck[];
  cardsByDeck: Map<string, Card[]>;
  /** Free-text filter; when set the tree flattens to matching decks. */
  query?: string;
  /** Cap the number of rendered rows (used on Home). */
  maxRows?: number;
  onConfig?: (deck: Deck) => void;
  onDelete?: (deck: Deck) => void;
}

/** Review target for a node: the real deck id, or a "group:" path token for a
 *  pure grouping parent (no own deck). Studying either pulls all descendants. */
function reviewTarget(node: DeckTreeNode): string {
  return node.deck ? node.deck.id : groupReviewToken(node.path);
}

export function DeckTree({ decks, cardsByDeck, query, maxRows, onConfig, onDelete }: DeckTreeProps) {
  const settings = useSettings();
  const deckPaths = settings?.deckPaths;
  const collapsed = useMemo(
    () => new Set(settings?.deckTreeCollapsed ?? []),
    [settings?.deckTreeCollapsed],
  );
  const [menuPath, setMenuPath] = useState<string | null>(null);

  const roots = useMemo(
    () => buildDeckTree(decks, deckPaths, cardsByDeck),
    [decks, deckPaths, cardsByDeck],
  );

  function toggle(path: string) {
    const next = new Set(collapsed);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    void repo.saveSettings({ deckTreeCollapsed: [...next] });
  }

  // Search flattens the tree to matching decks (name or full path), no nesting.
  const q = query?.toLowerCase().trim() ?? '';
  if (q) {
    const matches = decks
      .filter((d) => {
        const path = deckPathOf(d, deckPaths);
        return d.name.toLowerCase().includes(q) || path.toLowerCase().includes(q);
      })
      .map((d) => ({ deck: d, path: deckPathOf(d, deckPaths) }));
    if (matches.length === 0) return null;
    return (
      <div className="flex flex-col gap-1">
        {matches.map(({ deck, path }) => {
          const counts = aggregateCounts(
            { path, name: deck.name, depth: 0, deck, ownCards: cardsByDeck.get(deck.id) ?? [], children: [] },
            Date.now(),
          );
          return (
            <DeckTreeRow
              key={deck.id}
              node={{ path, name: deck.name, depth: 0, deck, ownCards: cardsByDeck.get(deck.id) ?? [], children: [] }}
              counts={counts}
              expanded={false}
              fullPath={path}
              onToggle={() => {}}
              menuOpen={menuPath === path}
              onMenu={() => setMenuPath((p) => (p === path ? null : path))}
              onCloseMenu={() => setMenuPath(null)}
              onConfig={onConfig}
              onDelete={onDelete}
            />
          );
        })}
      </div>
    );
  }

  // Pre-order flatten honoring collapse, so a single map renders the indented
  // tree and respects an optional row cap.
  const rows: DeckTreeNode[] = [];
  const walk = (nodes: DeckTreeNode[]) => {
    for (const n of nodes) {
      rows.push(n);
      if (n.children.length && !collapsed.has(n.path)) walk(n.children);
    }
  };
  walk(roots);
  const shown = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <div className="flex flex-col gap-1">
      {shown.map((node) => (
        <DeckTreeRow
          key={node.path}
          node={node}
          counts={aggregateCounts(node, Date.now())}
          expanded={!collapsed.has(node.path)}
          fullPath={node.path}
          onToggle={() => toggle(node.path)}
          menuOpen={menuPath === node.path}
          onMenu={() => setMenuPath((p) => (p === node.path ? null : node.path))}
          onCloseMenu={() => setMenuPath(null)}
          onConfig={onConfig}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- row --- */
function DeckTreeRow({
  node,
  counts,
  expanded,
  fullPath,
  onToggle,
  menuOpen,
  onMenu,
  onCloseMenu,
  onConfig,
  onDelete,
}: {
  node: DeckTreeNode;
  counts: ReturnType<typeof aggregateCounts>;
  expanded: boolean;
  fullPath: string;
  onToggle: () => void;
  menuOpen: boolean;
  onMenu: () => void;
  onCloseMenu: () => void;
  onConfig?: (deck: Deck) => void;
  onDelete?: (deck: Deck) => void;
}) {
  const nav = useNavigate();
  const hasChildren = node.children.length > 0;
  const studiable = isStudiable(node);
  const accent = node.deck?.color ?? 'var(--accent)';
  const pct = counts.total ? Math.round((counts.mastered / counts.total) * 100) : 0;

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-[var(--r-sm)] transition-colors hover:bg-[color:var(--surface-2)] min-w-0"
      style={{
        marginLeft: node.depth * 18,
        borderLeft: node.depth > 0 ? '1px solid var(--line)' : undefined,
        paddingLeft: node.depth > 0 ? 12 : undefined,
      }}
      title={fullPath}
    >
      {/* Chevron (or aligned spacer so rows line up) */}
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? 'Recolher' : 'Expandir'}
          aria-expanded={expanded}
          className="p-1 -ml-1 rounded text-muted hover:text-fg shrink-0"
        >
          <ChevronRight
            size={16}
            style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.16s ease' }}
          />
        </button>
      ) : (
        <span className="w-[18px] shrink-0" aria-hidden />
      )}

      {/* Avatar: deck logo, or a folder for a pure grouping node */}
      {node.deck ? (
        <DeckAvatar deck={node.deck} size={36} />
      ) : (
        <span
          className="flex items-center justify-center rounded-[var(--r-sm)] shrink-0"
          style={{ width: 36, height: 36, background: 'var(--surface-2)', color: 'var(--muted)' }}
        >
          <Folder size={18} />
        </span>
      )}

      <button
        type="button"
        onClick={() => (node.deck ? nav(`/decks/${node.deck.id}`) : onToggle())}
        className="min-w-0 flex-1 text-left"
      >
        <p className="font-semibold truncate leading-tight">{node.name}</p>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted truncate">
            {counts.total} cards
            {counts.due > 0 && (
              <span style={{ color: accent }}> · {counts.due} a revisar</span>
            )}
          </span>
          {node.deck && <AlgoBadge algorithm={node.deck.algorithm} className="shrink-0" />}
        </div>
        {node.deck && (
          <div className="flex items-center gap-2 min-w-0 mt-1">
            <div className="h-1 flex-1 min-w-0 rounded-full" style={{ background: 'var(--surface-2)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 999 }} />
            </div>
          </div>
        )}
      </button>

      {studiable && (
        <Link
          to={`/review/${encodeURIComponent(reviewTarget(node))}`}
          className="btn btn-accent btn-sm shrink-0"
          aria-label={`Estudar ${node.name}`}
        >
          <Play size={14} /> <span className="hidden sm:inline">Estudar</span>
        </Link>
      )}

      {/* Overflow menu only for real decks (grouping nodes aren't editable) */}
      {node.deck ? (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={onMenu}
            aria-label="Mais opções"
            className="p-2 rounded-[var(--r-sm)] text-muted hover:text-fg hover:bg-[color:var(--surface-2)] transition-colors"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && <div className="fixed inset-0 z-40" onClick={onCloseMenu} />}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                key="treemenu"
                className="absolute right-0 z-50 mt-1 w-44 py-1"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  transformOrigin: 'top right',
                  background: 'var(--surface)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--shadow-pop)',
                }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                  onClick={() => {
                    onCloseMenu();
                    if (node.deck) nav(`/decks/${node.deck.id}`);
                  }}
                >
                  <Pencil size={14} /> Editar
                </button>
                {onConfig && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                    onClick={() => {
                      onCloseMenu();
                      if (node.deck) onConfig(node.deck);
                    }}
                  >
                    <Settings2 size={14} /> Configurações
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-[color:var(--surface-2)] transition-colors"
                    onClick={() => {
                      onCloseMenu();
                      if (node.deck) onDelete(node.deck);
                    }}
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <span className="w-[34px] shrink-0" aria-hidden />
      )}
    </div>
  );
}
