import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownUp, Check, ChevronRight, Folder, GripVertical, MoreVertical, Pencil, Play, Settings2, Trash2 } from 'lucide-react';
import { repo } from '../../db/repositories';
import { useSettings } from '../../db/hooks';
import { DeckAvatar } from './deckIcons';
import { AlgoBadge } from './AlgoBadge';
import { CardCounts } from './CardCounts';
import {
  aggregateCounts,
  buildDeckTree,
  deckPathOf,
  groupReviewToken,
  isStudiable,
  nestDeckPaths,
} from '../../lib/deckTree';
import type { DeckTreeNode } from '../../lib/deckTree';
import { useNestDrag, NestGhost } from './nestDrag';
import { cn } from '../../lib/cn';
import type { Card, Deck } from '../../db/types';

/**
 * Shared column classes for the Decks "table" layout, so the header row rendered
 * by DeckBrowser lines up with the deck rows here at every breakpoint.
 */
export const DECK_TABLE = {
  countGroup: 'flex items-center gap-1 sm:gap-2 shrink-0',
  countCell: 'w-9 sm:w-16 text-center tabular-nums',
  actionsW: 'w-[80px] sm:w-[150px] shrink-0',
};

interface DeckTreeProps {
  decks: Deck[];
  cardsByDeck: Map<string, Card[]>;
  /** Free-text filter; when set the tree flattens to matching decks. */
  query?: string;
  /** Cap the number of rendered rows (used on Home). */
  maxRows?: number;
  /** 'table' = aligned columns + dividers for the Decks page; 'plain' elsewhere. */
  variant?: 'plain' | 'table';
  onConfig?: (deck: Deck) => void;
  onDelete?: (deck: Deck) => void;
}

/** Review target for a node: the real deck id, or a "group:" path token for a
 *  pure grouping parent (no own deck). Studying either pulls all descendants. */
function reviewTarget(node: DeckTreeNode): string {
  return node.deck ? node.deck.id : groupReviewToken(node.path);
}

/**
 * Smooth, flicker-free height collapse via the CSS grid 0fr→1fr trick: the
 * browser interpolates the row track itself, so there is NO per-frame JS height
 * measurement — the cause of the old `height:auto` animation blinking the
 * subtree out mid-slide whenever the tree re-rendered. Children stay mounted
 * through the close (from a cached snapshot, since the parent stops handing them
 * over once collapsed so the row budget stays honest) and unmount after.
 */
function Collapse({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const durationMs = reduce ? 0 : 240;
  const [mounted, setMounted] = useState(open);
  // Clip only WHILE sliding. Once fully expanded, allow overflow so an open deck
  // dropdown menu can spill past the rows instead of being cut off under the
  // next deck. Collapsing clips again immediately so the slide-up stays masked.
  const [clip, setClip] = useState(!open);
  const cached = useRef<ReactNode>(null);
  if (open) cached.current = children; // keep the latest content while expanded

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setClip(false), durationMs);
      return () => clearTimeout(t);
    }
    // Hold the content for one transition, then drop it once fully collapsed.
    setClip(true);
    const t = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: `grid-template-rows ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      <div style={{ overflow: clip ? 'hidden' : 'visible', minHeight: 0 }} className={className}>
        {open ? children : mounted ? cached.current : null}
      </div>
    </div>
  );
}

export function DeckTree({
  decks,
  cardsByDeck,
  query,
  maxRows,
  variant = 'plain',
  onConfig,
  onDelete,
}: DeckTreeProps) {
  const settings = useSettings();
  const deckPaths = settings?.deckPaths;
  // Collapse/expand is owned LOCALLY once the user interacts. The state used to be
  // derived straight from the global `settings` query, so a background refetch of
  // getSettings (e.g. the slow initial load still in flight, or the failure-path
  // invalidate) could return the pre-toggle value and clobber the optimistic
  // open — the tree "abria e fechava sozinho" ~1s after a click. Owning it here
  // makes the UI immune to that race; we still seed from and persist to settings.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(settings?.deckTreeCollapsed ?? []),
  );
  const ownedRef = useRef(false);
  useEffect(() => {
    // Until the first local toggle, mirror the persisted value (covers the async
    // settings load and changes from elsewhere); after that, local state wins.
    if (ownedRef.current) return;
    setCollapsed(new Set(settings?.deckTreeCollapsed ?? []));
  }, [settings?.deckTreeCollapsed]);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  // Reposicionar: arrastar decks para reordenar IRMÃOS (≠ aninhar/criar subdeck).
  // Em reorder mode usamos uma ordem LOCAL (atualizada na hora p/ o Reorder não
  // dar "snap back") e persistimos em settings.deckOrder em background.
  const [reorderMode, setReorderMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<Record<string, number>>({});
  const order = reorderMode ? localOrder : settings?.deckOrder;
  const enterReorder = () => {
    setLocalOrder({ ...(settings?.deckOrder ?? {}) });
    setReorderMode(true);
  };
  const applyReorder = (paths: string[]) => {
    const next = { ...localOrder };
    paths.forEach((p, i) => {
      next[p] = i;
    });
    setLocalOrder(next);
    void repo.saveSettings({ deckOrder: next });
  };
  // Re-parent a deck (drag source) under a target path, persisting deckPaths.
  const onNest = useCallback(
    (dragPath: string, targetPath: string) => {
      const next = nestDeckPaths(decks, deckPaths, dragPath, targetPath);
      if (next) void repo.saveSettings({ deckPaths: next });
    },
    [decks, deckPaths],
  );
  const table = variant === 'table';
  // Table rows are flush (separated by hairlines); the plain list keeps a gap.
  const listClass = table ? 'flex flex-col' : 'flex flex-col gap-1';

  const roots = useMemo(
    () => buildDeckTree(decks, deckPaths, cardsByDeck, order),
    [decks, deckPaths, cardsByDeck, order],
  );

  function toggle(path: string) {
    ownedRef.current = true;
    const next = new Set(collapsed);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsed(next); // instant + stable: a settings refetch can't revert it
    void repo.saveSettings({ deckTreeCollapsed: [...next] }); // persist in the background
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
      <div className={listClass}>
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
              variant={variant}
              expanded={false}
              fullPath={path}
              onToggle={() => {}}
              menuOpen={menuPath === path}
              onMenu={() => setMenuPath((p) => (p === path ? null : path))}
              onOpenMenu={() => setMenuPath(path)}
              onCloseMenu={() => setMenuPath(null)}
              onConfig={onConfig}
              onDelete={onDelete}
              onNest={onNest}
              onReposition={enterReorder}
            />
          );
        })}
      </div>
    );
  }

  // Render recursively so each node's children live in their own collapsible
  // container that slides down/up on expand/collapse. A shared budget caps the
  // visible rows (used on Home); collapsed children don't consume it.
  const budget = { left: maxRows ?? Infinity };

  const renderNodes = (nodes: DeckTreeNode[]): ReactNode[] => {
    const out: ReactNode[] = [];
    for (const node of nodes) {
      if (budget.left <= 0) break;
      budget.left -= 1;
      const expanded = !collapsed.has(node.path);
      out.push(
        <div key={node.path}>
          <DeckTreeRow
            node={node}
            counts={aggregateCounts(node, Date.now())}
            variant={variant}
            expanded={expanded}
            fullPath={node.path}
            onToggle={() => toggle(node.path)}
            menuOpen={menuPath === node.path}
            onMenu={() => setMenuPath((p) => (p === node.path ? null : node.path))}
            onOpenMenu={() => setMenuPath(node.path)}
            onCloseMenu={() => setMenuPath(null)}
            onConfig={onConfig}
            onDelete={onDelete}
            onNest={onNest}
            onReposition={enterReorder}
          />
          {node.children.length > 0 && (
            // Gate the recursion on `expanded` so collapsed subtrees neither
            // render nor spend the row budget; Collapse caches them for the
            // slide-up. The padding lives inside so it clips away with the rows.
            <Collapse open={expanded} className={table ? 'flex flex-col' : 'flex flex-col gap-1 pt-1'}>
              {expanded ? renderNodes(node.children) : null}
            </Collapse>
          )}
        </div>,
      );
    }
    return out;
  };

  // Reorder mode: each sibling group is a Reorder.Group; rows drag by the handle.
  const renderReorder = (nodes: DeckTreeNode[]): ReactNode => (
    <Reorder.Group
      as="div"
      axis="y"
      values={nodes.map((n) => n.path)}
      onReorder={applyReorder}
      className={listClass}
    >
      {nodes.map((node) => (
        <ReorderRow
          key={node.path}
          node={node}
          counts={aggregateCounts(node, Date.now())}
          variant={variant}
          table={table}
          expanded={!collapsed.has(node.path)}
          onToggle={() => toggle(node.path)}
          onConfig={onConfig}
          onDelete={onDelete}
          renderChildren={renderReorder}
        />
      ))}
    </Reorder.Group>
  );

  return (
    <div>
      <AnimatePresence>
        {reorderMode && (
          <motion.div
            key="reorder-bar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-[var(--r-sm)]"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
            >
              <span className="text-sm text-muted flex items-center gap-2 min-w-0">
                <GripVertical size={15} className="shrink-0" />
                <span className="truncate">Arraste pelo punho para reposicionar os decks.</span>
              </span>
              <button type="button" onClick={() => setReorderMode(false)} className="btn btn-accent btn-sm shrink-0">
                <Check size={14} /> Concluir
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {reorderMode ? renderReorder(roots) : <div className={listClass}>{renderNodes(roots)}</div>}
    </div>
  );
}

/* --------------------------------------------------------- reorder row --- */
/** A deck row in reposition mode: a Reorder.Item dragged by its left handle (the
 *  handle fades in and slides the row content right). Reorders SIBLINGS only —
 *  never nests. Its own subtree (if expanded) is a nested Reorder.Group. */
function ReorderRow({
  node,
  counts,
  variant,
  table,
  expanded,
  onToggle,
  onConfig,
  onDelete,
  renderChildren,
}: {
  node: DeckTreeNode;
  counts: ReturnType<typeof aggregateCounts>;
  variant: 'plain' | 'table';
  table: boolean;
  expanded: boolean;
  onToggle: () => void;
  onConfig?: (deck: Deck) => void;
  onDelete?: (deck: Deck) => void;
  renderChildren: (nodes: DeckTreeNode[]) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const handle = (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, width: 0, marginRight: 0 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, width: 22, marginRight: 6 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, width: 0, marginRight: 0 }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: 'hidden', flexShrink: 0, display: 'inline-flex' }}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label="Arraste para reposicionar"
        title="Arraste para reposicionar"
        className="grid place-items-center text-muted hover:text-fg"
        style={{ cursor: 'grab', touchAction: 'none', width: 22 }}
      >
        <GripVertical size={18} />
      </button>
    </motion.div>
  );

  return (
    <Reorder.Item
      as="div"
      value={node.path}
      dragListener={false}
      dragControls={controls}
      transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <DeckTreeRow
        node={node}
        counts={counts}
        variant={variant}
        expanded={expanded}
        fullPath={node.path}
        onToggle={onToggle}
        menuOpen={false}
        onMenu={() => {}}
        onOpenMenu={() => {}}
        onCloseMenu={() => {}}
        onConfig={onConfig}
        onDelete={onDelete}
        onNest={() => {}}
        reorderHandle={handle}
      />
      {node.children.length > 0 && (
        <Collapse open={expanded} className={table ? 'flex flex-col' : 'flex flex-col gap-1 pt-1'}>
          {expanded ? renderChildren(node.children) : null}
        </Collapse>
      )}
    </Reorder.Item>
  );
}

/* ------------------------------------------------------------------- row --- */
function DeckTreeRow({
  node,
  counts,
  variant,
  expanded,
  fullPath,
  onToggle,
  menuOpen,
  onMenu,
  onOpenMenu,
  onCloseMenu,
  onConfig,
  onDelete,
  onNest,
  onReposition,
  reorderHandle,
}: {
  node: DeckTreeNode;
  counts: ReturnType<typeof aggregateCounts>;
  variant: 'plain' | 'table';
  expanded: boolean;
  fullPath: string;
  onToggle: () => void;
  menuOpen: boolean;
  onMenu: () => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onConfig?: (deck: Deck) => void;
  onDelete?: (deck: Deck) => void;
  onNest: (dragPath: string, targetPath: string) => void;
  /** Abre o modo de reposicionar (a partir do menu de contexto). */
  onReposition?: () => void;
  /** Quando presente, a linha está em modo reposicionar: mostra este punho à
   *  esquerda (fade+slide) e desliga o arraste de aninhamento e o menu. */
  reorderHandle?: ReactNode;
}) {
  const nav = useNavigate();
  const hasChildren = node.children.length > 0;
  const studiable = isStudiable(node);
  const table = variant === 'table';
  const reordering = reorderHandle !== undefined;
  const { nestProps, dragging, isTarget } = useNestDrag({
    path: node.path,
    label: node.name,
    enabled: !!node.deck && !reordering,
    onDrop: onNest,
  });

  const studyBtn = studiable ? (
    <Link
      to={`/review/${encodeURIComponent(reviewTarget(node))}`}
      className="btn btn-accent btn-sm shrink-0"
      aria-label={`Estudar ${node.name}`}
    >
      <Play size={14} /> <span className="hidden sm:inline">Estudar</span>
    </Link>
  ) : null;

  const kebab = node.deck && !reordering ? (
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
            {onReposition && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                onClick={() => {
                  onCloseMenu();
                  onReposition();
                }}
              >
                <ArrowDownUp size={14} /> Reposicionar
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
  ) : null;

  return (
    <div
      {...(reordering ? {} : nestProps)}
      onContextMenu={
        reordering
          ? undefined
          : (e) => {
              // Right-click a deck opens its settings/kebab menu (desktop).
              if (!node.deck) return;
              e.preventDefault();
              onOpenMenu();
            }
      }
      className={cn(
        // Sidebar-style hover "jump" (rightward nudge). Locked while this row's
        // menu is open so the dropdown stays put. Tight left spacing on mobile so
        // the deck name gets the room (icons sit further left).
        'deck-jump flex items-center gap-1.5 sm:gap-3 hover:bg-[color:var(--surface-2)] min-w-0',
        (menuOpen || dragging || reordering) && 'deck-jump-locked',
        table ? 'px-2 sm:px-3 py-2.5' : 'py-2.5 pl-1.5 pr-2 sm:p-3 rounded-[var(--r-sm)]',
      )}
      style={{
        marginLeft: node.depth * (table ? 16 : 18),
        borderLeft: node.depth > 0 ? '1px solid var(--line)' : undefined,
        paddingLeft: node.depth > 0 ? 12 : undefined,
        borderBottom: table ? '1px solid var(--line)' : undefined,
        opacity: dragging && !reordering ? 0.5 : undefined,
        outline: isTarget ? '2px solid var(--accent)' : undefined,
        outlineOffset: isTarget ? -2 : undefined,
        background: isTarget ? 'var(--surface-2)' : undefined,
        borderRadius: isTarget && !table ? 'var(--r-sm)' : undefined,
        cursor: dragging ? 'grabbing' : undefined,
        touchAction: node.deck ? 'pan-y' : undefined,
        WebkitTouchCallout: node.deck ? 'none' : undefined,
        WebkitUserSelect: node.deck ? 'none' : undefined,
        userSelect: node.deck ? 'none' : undefined,
      }}
      title={fullPath}
    >
      {reorderHandle}
      {!reordering && dragging && <NestGhost />}
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
        <span className="w-1.5 sm:w-[18px] shrink-0" aria-hidden />
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
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold truncate leading-tight">{node.name}</p>
          {node.deck && (
            // Wrapper carries `hidden` so it actually hides on mobile (.pill-algo
            // sets display:inline-flex, which would override `hidden` directly on
            // the badge). The deck name takes the freed space.
            <span className="shrink-0 hidden sm:inline-flex">
              <AlgoBadge algorithm={node.deck.algorithm} />
            </span>
          )}
        </div>
      </button>

      {/* Counts: new · learning · due (aggregated across a parent's subtree). */}
      {table ? (
        <>
          <div className={DECK_TABLE.countGroup}>
            <span
              className={cn(DECK_TABLE.countCell, 'text-sm')}
              style={{ color: counts.newCount > 0 ? 'var(--accent-blue)' : 'var(--line-strong)' }}
            >
              {counts.newCount}
            </span>
            <span
              className={cn(DECK_TABLE.countCell, 'text-sm')}
              style={{ color: counts.learning > 0 ? 'var(--accent)' : 'var(--line-strong)' }}
            >
              {counts.learning}
            </span>
            <span
              className={cn(DECK_TABLE.countCell, 'text-sm')}
              style={{ color: counts.reviewDue > 0 ? 'var(--accent-green)' : 'var(--line-strong)' }}
            >
              {counts.reviewDue}
            </span>
          </div>
          <div className={cn(DECK_TABLE.actionsW, 'flex items-center justify-end gap-1.5')}>
            {studyBtn}
            {/* Spacer keeps a group's Estudar aligned with deck rows that have a "⋮". */}
            {kebab ?? <span className="w-[34px] shrink-0" aria-hidden />}
          </div>
        </>
      ) : (
        <>
          <CardCounts newCount={counts.newCount} learning={counts.learning} reviewDue={counts.reviewDue} />
          {studyBtn}
          {kebab ?? <span className="w-[34px] shrink-0" aria-hidden />}
        </>
      )}
    </div>
  );
}
