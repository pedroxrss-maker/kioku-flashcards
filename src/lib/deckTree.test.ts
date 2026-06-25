import { describe, expect, it } from 'vitest';
import { makeCard, makeDeck } from '../db/factories';
import type { Card, Deck, DeckCountSet } from '../db/types';
import { groupCardsByDeck } from './deckStats';
import {
  ROOT_DROP_TARGET,
  aggregateCards,
  aggregateCountSet,
  aggregateCounts,
  buildDeckTree,
  deckPathOf,
  hasHierarchy,
  isStudiable,
  leafName,
  memberDeckIdsForPath,
  nestDeckPaths,
  subtreeDeckIds,
} from './deckTree';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const DAY = 86_400_000;

let seq = 0;
function deck(name: string): Deck {
  // deterministic, increasing createdAt so tree order is stable
  return { ...makeDeck({ name, color: '#fff' }), id: `deck-${name}`, createdAt: seq++ };
}
function dueCard(deckId: string): Card {
  return { ...makeCard({ deckId, front: 'f', back: 'b' }), state: 'review', due: NOW - DAY };
}

describe('deckTree', () => {
  it('treats a deck with no path as a flat top-level deck', () => {
    const d = deck('Biologia');
    const tree = buildDeckTree([d], {}, groupCardsByDeck([]));
    expect(hasHierarchy([d], {})).toBe(false);
    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].name).toBe('Biologia');
    expect(tree[0].deck).toBe(d);
    expect(tree[0].children).toHaveLength(0);
  });

  it('builds the correct nested tree from "::" paths', () => {
    const parent = deck('Inglês');
    const gram = deck('Gramática');
    const verbs = deck('Tempos Verbais');
    const paths = {
      [parent.id]: 'Inglês',
      [gram.id]: 'Inglês::Gramática',
      [verbs.id]: 'Inglês::Gramática::Tempos Verbais',
    };
    expect(hasHierarchy([parent, gram, verbs], paths)).toBe(true);

    const tree = buildDeckTree([parent, gram, verbs], paths, groupCardsByDeck([]));
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.name).toBe('Inglês');
    expect(root.children).toHaveLength(1);
    const g = root.children[0];
    expect(g.path).toBe('Inglês::Gramática');
    expect(leafName(g.path)).toBe('Gramática');
    expect(g.children[0].name).toBe('Tempos Verbais');
    expect(g.children[0].depth).toBe(2);
  });

  it('creates a grouping node for a missing Anki parent (no own cards)', () => {
    const sub = deck('Gramática');
    const paths = { [sub.id]: 'Inglês::Gramática' }; // "Inglês" has no deck
    const tree = buildDeckTree([sub], paths, groupCardsByDeck([]));
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Inglês');
    expect(tree[0].deck).toBeNull(); // pure grouping node
    expect(tree[0].children[0].deck).toBe(sub);
  });

  it('aggregates due counts on a parent as the sum of its descendants', () => {
    const parent = deck('Inglês'); // 1 own due card
    const gram = deck('Gramática'); // 2 own due cards
    const verbs = deck('Verbos'); // 3 own due cards
    const paths = {
      [parent.id]: 'Inglês',
      [gram.id]: 'Inglês::Gramática',
      [verbs.id]: 'Inglês::Gramática::Verbos',
    };
    const cards = [
      dueCard(parent.id),
      dueCard(gram.id),
      dueCard(gram.id),
      dueCard(verbs.id),
      dueCard(verbs.id),
      dueCard(verbs.id),
    ];
    const tree = buildDeckTree([parent, gram, verbs], paths, groupCardsByDeck(cards));
    const root = tree[0];
    expect(aggregateCounts(root, NOW).due).toBe(6); // 1 + 2 + 3
    expect(aggregateCounts(root.children[0], NOW).due).toBe(5); // Gramática + Verbos
    expect(aggregateCards(root).length).toBe(6);
    expect(isStudiable(root)).toBe(true);
  });

  it('lists a parent + all descendant deck ids for review', () => {
    const parent = deck('Inglês');
    const gram = deck('Gramática');
    const verbs = deck('Verbos');
    const other = deck('Matemática');
    const paths = {
      [parent.id]: 'Inglês',
      [gram.id]: 'Inglês::Gramática',
      [verbs.id]: 'Inglês::Gramática::Verbos',
      [other.id]: 'Matemática',
    };
    const all = [parent, gram, verbs, other];
    const members = memberDeckIdsForPath('Inglês', all, paths);
    expect(new Set(members)).toEqual(new Set([parent.id, gram.id, verbs.id]));
    // leaf review pulls only itself
    expect(memberDeckIdsForPath('Matemática', all, paths)).toEqual([other.id]);
  });

  it('subtreeDeckIds skips grouping nodes but includes real descendants', () => {
    const sub = deck('Gramática');
    const paths = { [sub.id]: 'Inglês::Gramática' };
    const tree = buildDeckTree([sub], paths, groupCardsByDeck([]));
    expect(subtreeDeckIds(tree[0])).toEqual([sub.id]); // "Inglês" group contributes no id
  });

  it('deckPathOf falls back to the deck name without a stored path', () => {
    const d = deck('Solo');
    expect(deckPathOf(d, {})).toBe('Solo');
    expect(deckPathOf(d, { [d.id]: 'A::Solo' })).toBe('A::Solo');
  });

  it('aggregateCountSet: a parent DECK shows its OWN new_count, not the subtree sum', () => {
    // Repro of the "20 novos" bug: parent deck new_per_day=0 (deck_counts new=0)
    // with a subdeck that still has 20 new cards. The parent row must read 0 new
    // (its own deck_counts value), while due/learning still SUM across the subtree.
    const parent = deck('Geografia');
    const child = deck('Bandeiras');
    const paths = { [parent.id]: 'Geografia', [child.id]: 'Geografia::Bandeiras' };
    const tree = buildDeckTree([parent, child], paths, groupCardsByDeck([]));
    const parentNode = tree[0];
    expect(parentNode.deck).toBe(parent);
    const counts: Record<string, DeckCountSet> = {
      [parent.id]: { newCount: 0, learning: 1, reviewDue: 1, due: 1, total: 5 },
      [child.id]: { newCount: 20, learning: 2, reviewDue: 2, due: 2, total: 30 },
    };
    const agg = aggregateCountSet(parentNode, counts);
    expect(agg.newCount).toBe(0); // OWN new (new_per_day=0), NOT 0 + 20
    expect(agg.learning).toBe(3); // summed across the subtree
    expect(agg.reviewDue).toBe(3);
    expect(agg.due).toBe(3);
    expect(agg.total).toBe(35);
    // The subdeck still shows its own new count.
    expect(aggregateCountSet(parentNode.children[0], counts).newCount).toBe(20);
  });

  it('aggregateCountSet: a pure FOLDER (no own deck) keeps the summed new_count', () => {
    const sub = deck('Gramática');
    const paths = { [sub.id]: 'Inglês::Gramática' }; // "Inglês" is a folder, no deck
    const tree = buildDeckTree([sub], paths, groupCardsByDeck([]));
    const folder = tree[0];
    expect(folder.deck).toBeNull();
    const counts: Record<string, DeckCountSet> = {
      [sub.id]: { newCount: 7, learning: 0, reviewDue: 0, due: 0, total: 7 },
    };
    expect(aggregateCountSet(folder, counts).newCount).toBe(7); // summed (no own row)
  });
});

describe('nestDeckPaths', () => {
  it('nests a top-level deck under another', () => {
    const a = deck('A');
    const b = deck('B');
    expect(nestDeckPaths([a, b], {}, 'B', 'A')).toEqual({ [b.id]: 'A::B' });
  });

  it('re-prefixes the whole subtree when nesting a parent', () => {
    const a = deck('A');
    const c = deck('C');
    const b = deck('B');
    const paths = { [c.id]: 'A::C' };
    expect(nestDeckPaths([a, c, b], paths, 'A', 'B')).toEqual({
      [c.id]: 'B::A::C',
      [a.id]: 'B::A',
    });
  });

  it('lifts a nested deck back to the top level on a root drop', () => {
    const a = deck('A');
    const b = deck('B');
    const paths = { [b.id]: 'A::B' };
    expect(nestDeckPaths([a, b], paths, 'A::B', ROOT_DROP_TARGET)).toEqual({ [b.id]: 'B' });
  });

  it('re-prefixes descendants when lifting a subtree to the top level', () => {
    const b = deck('B');
    const c = deck('C');
    const paths = { [b.id]: 'A::B', [c.id]: 'A::B::C' };
    expect(nestDeckPaths([b, c], paths, 'A::B', ROOT_DROP_TARGET)).toEqual({
      [b.id]: 'B',
      [c.id]: 'B::C',
    });
  });

  it('rejects illegal or no-op moves', () => {
    const a = deck('A');
    const b = deck('B');
    const c = deck('C');
    const paths = { [b.id]: 'A::B', [c.id]: 'A::C' };
    const all = [a, b, c];
    expect(nestDeckPaths(all, paths, 'A', 'A')).toBeNull(); // onto itself
    expect(nestDeckPaths(all, paths, 'A', 'A::C')).toBeNull(); // into own descendant
    expect(nestDeckPaths(all, paths, 'A::B', 'A')).toBeNull(); // already that parent
    expect(nestDeckPaths(all, {}, 'A', ROOT_DROP_TARGET)).toBeNull(); // already top-level
  });
});
