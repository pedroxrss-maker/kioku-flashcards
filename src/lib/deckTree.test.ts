import { describe, expect, it } from 'vitest';
import { makeCard, makeDeck } from '../db/factories';
import type { Card, Deck } from '../db/types';
import { groupCardsByDeck } from './deckStats';
import {
  aggregateCards,
  aggregateCounts,
  buildDeckTree,
  deckPathOf,
  hasHierarchy,
  isStudiable,
  leafName,
  memberDeckIdsForPath,
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
});
