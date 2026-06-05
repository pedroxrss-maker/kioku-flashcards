import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useAllCards, useDecks } from '../../db/hooks';
import { Pill } from '../../components/Pill';
import { groupCardsByDeck } from '../../lib/deckStats';
import { DeckCard } from './DeckCard';
import { CreateDeckModal } from './CreateDeckModal';

export function DeckBrowser() {
  const decks = useDecks();
  const allCards = useAllCards();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const byDeck = useMemo(() => groupCardsByDeck(allCards), [allCards]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    decks.forEach((d) => d.category && set.add(d.category));
    return [...set].sort();
  }, [decks]);

  const filtered = decks.filter(
    (d) =>
      (!category || d.category === category) &&
      d.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-2 flex-1">
          <Pill active={category === null} onClick={() => setCategory(null)}>
            Todos
          </Pill>
          {categories.map((c) => (
            <Pill key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Pill>
          ))}
        </div>
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            className="field pl-9"
            style={{ minWidth: 200 }}
            placeholder="Buscar deck..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((deck) => (
          <DeckCard key={deck.id} deck={deck} cards={byDeck.get(deck.id) ?? []} />
        ))}

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="hover-lift flex flex-col items-center justify-center gap-2 p-8 text-muted hover:text-fg min-h-[150px] transition-colors"
          style={{ border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)' }}
        >
          <Plus size={26} />
          <span className="mono text-xs">Criar novo deck</span>
        </button>
      </div>

      {filtered.length === 0 && query && (
        <p className="text-muted text-sm mt-4">Nenhum deck encontrado para “{query}”.</p>
      )}

      <CreateDeckModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
