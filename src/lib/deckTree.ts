/* ===========================================================================
   Hierarchical deck tree, derived at runtime from each deck's "::"-separated
   path (Anki-style). The data layer is unchanged: a deck's path lives in
   settings.deckPaths (deckId -> "A::B::C"); decks without a path / without "::"
   are flat top-level decks and behave exactly as before.
   =========================================================================== */
import type { Card, Deck } from '../db/types';
import { countCards } from './deckStats';
import type { DeckCounts } from './deckStats';

export const PATH_SEP = '::';

/** Full hierarchical path for a deck: its stored path, else its plain name. */
export function deckPathOf(deck: Deck, deckPaths?: Record<string, string>): string {
  const p = deckPaths?.[deck.id];
  return p && p.trim() ? p.trim() : deck.name;
}

/** Split a path into clean, non-empty segments. */
export function splitPath(path: string): string[] {
  return path
    .split(PATH_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Last segment of a path — the short label shown in the tree. */
export function leafName(path: string): string {
  const parts = splitPath(path);
  return parts[parts.length - 1] ?? path;
}

/** True if any deck carries a real hierarchy (a "::" in its path). When false,
 *  callers keep the existing flat list/grid so nothing changes for flat users. */
export function hasHierarchy(decks: Deck[], deckPaths?: Record<string, string>): boolean {
  return decks.some((d) => deckPathOf(d, deckPaths).includes(PATH_SEP));
}

export interface DeckTreeNode {
  /** Full path of this node, e.g. "Inglês::Gramática". */
  path: string;
  /** Short label (last segment), e.g. "Gramática". */
  name: string;
  /** 0 = top level. */
  depth: number;
  /** The deck living exactly at this path, or null for a pure grouping node
   *  (an Anki parent with no cards of its own). */
  deck: Deck | null;
  /** Cards of this node's own deck (empty for grouping nodes). */
  ownCards: Card[];
  children: DeckTreeNode[];
}

/**
 * Build the forest of top-level nodes from the decks + their paths. Intermediate
 * path segments with no matching deck become grouping nodes (deck = null).
 * Order is stable by deck creation time (parents inherit their first child's
 * appearance order), matching the existing top-to-bottom deck ordering.
 */
export function buildDeckTree(
  decks: Deck[],
  deckPaths: Record<string, string> | undefined,
  cardsByDeck: Map<string, Card[]>,
): DeckTreeNode[] {
  const roots: DeckTreeNode[] = [];
  const byPath = new Map<string, DeckTreeNode>();

  const ensureNode = (segments: string[]): DeckTreeNode => {
    const path = segments.join(PATH_SEP);
    const existing = byPath.get(path);
    if (existing) return existing;
    const node: DeckTreeNode = {
      path,
      name: segments[segments.length - 1],
      depth: segments.length - 1,
      deck: null,
      ownCards: [],
      children: [],
    };
    byPath.set(path, node);
    if (segments.length === 1) roots.push(node);
    else ensureNode(segments.slice(0, -1)).children.push(node);
    return node;
  };

  const ordered = [...decks].sort((a, b) => a.createdAt - b.createdAt);
  for (const deck of ordered) {
    const segs = splitPath(deckPathOf(deck, deckPaths));
    if (segs.length === 0) continue;
    const node = ensureNode(segs);
    node.deck = deck;
    node.ownCards = cardsByDeck.get(deck.id) ?? [];
  }
  return roots;
}

/** All cards under a node (its own + every descendant's). */
export function aggregateCards(node: DeckTreeNode): Card[] {
  const out = [...node.ownCards];
  for (const child of node.children) out.push(...aggregateCards(child));
  return out;
}

/** Deck ids of a node and all its descendants (skips pure grouping nodes). */
export function subtreeDeckIds(node: DeckTreeNode): string[] {
  const ids: string[] = [];
  if (node.deck) ids.push(node.deck.id);
  for (const child of node.children) ids.push(...subtreeDeckIds(child));
  return ids;
}

/**
 * Aggregate card counts over a node's whole subtree. `due`/totals are summed
 * across descendants; `mastered` uses each descendant deck's own algorithm so
 * the maturity split stays correct even when subdecks differ.
 */
export function aggregateCounts(node: DeckTreeNode, now: number = Date.now()): DeckCounts {
  const acc: DeckCounts = {
    total: 0,
    newCount: 0,
    learning: 0,
    review: 0,
    due: 0,
    reviewDue: 0,
    mastered: 0,
  };
  const visit = (n: DeckTreeNode) => {
    if (n.ownCards.length) {
      const c = countCards(n.ownCards, now, n.deck ?? undefined);
      acc.total += c.total;
      acc.newCount += c.newCount;
      acc.learning += c.learning;
      acc.review += c.review;
      acc.due += c.due;
      acc.reviewDue += c.reviewDue;
      acc.mastered += c.mastered;
    }
    n.children.forEach(visit);
  };
  visit(node);
  return acc;
}

/** True if a node is worth a "Estudar" action (it or a descendant has cards). */
export function isStudiable(node: DeckTreeNode): boolean {
  if (node.ownCards.length > 0) return true;
  return node.children.some(isStudiable);
}

/**
 * Deck ids to pull when studying a path: the deck at that exact path (if any)
 * plus every descendant deck. Used by the review session so studying a parent
 * reviews the union of all its subdecks (Anki behavior). For a leaf with no
 * children this is just `[that deck]`, so leaf review is unchanged.
 */
export function memberDeckIdsForPath(
  path: string,
  decks: Deck[],
  deckPaths?: Record<string, string>,
): string[] {
  const prefix = path + PATH_SEP;
  return decks
    .filter((d) => {
      const p = deckPathOf(d, deckPaths);
      return p === path || p.startsWith(prefix);
    })
    .map((d) => d.id);
}

/* ---- review target tokens -------------------------------------------------
   A review session is launched with a route param. Real decks pass their id; a
   pure grouping node (no own deck) passes a "group:" token carrying its path so
   the session can still gather the descendant union. */
const GROUP_PREFIX = 'group:';

export function groupReviewToken(path: string): string {
  return GROUP_PREFIX + path;
}
export function isGroupToken(token: string | undefined): token is string {
  return !!token && token.startsWith(GROUP_PREFIX);
}
export function pathFromGroupToken(token: string): string {
  return token.slice(GROUP_PREFIX.length);
}
