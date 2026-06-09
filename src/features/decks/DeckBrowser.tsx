import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { useAllCards, useDecks, useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { groupCardsByDeck } from '../../lib/deckStats';
import { hasHierarchy } from '../../lib/deckTree';
import { Panel } from '../../components/Panel';
import { DeckCard } from './DeckCard';
import { DeckTree } from './DeckTree';
import { CreateDeckModal } from './CreateDeckModal';
import { DeckSettingsModal } from './DeckSettingsModal';
import type { Deck } from '../../db/types';

export function DeckBrowser() {
  const decks = useDecks();
  const allCards = useAllCards();
  const settings = useSettings();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDeck, setSettingsDeck] = useState<Deck | null>(null);

  const byDeck = useMemo(() => groupCardsByDeck(allCards), [allCards]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    decks.forEach((d) => d.category && set.add(d.category));
    return [...set].sort();
  }, [decks]);

  // Tree view kicks in only when at least one deck has a hierarchical path; with
  // purely flat decks the original card grid renders unchanged.
  const tree = hasHierarchy(decks, settings?.deckPaths);

  const byCategory = decks.filter((d) => !category || d.category === category);
  const filtered = byCategory.filter((d) =>
    d.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  function deleteDeck(deck: Deck) {
    // eslint-disable-next-line no-alert
    if (window.confirm(`Excluir o deck "${deck.name}" e todos os cards?`)) {
      void repo.deleteDeck(deck.id);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-2 flex-1">
          {[null, ...categories].map((c) => {
            const active = category === c;
            return (
              <button
                key={c ?? '__all'}
                type="button"
                onClick={() => setCategory(c)}
                className="pill"
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  color: active ? '#fff' : undefined,
                  borderColor: active ? 'transparent' : undefined,
                }}
              >
                {active && (
                  <motion.span
                    layoutId="cat-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 38 }}
                    style={{ position: 'absolute', inset: 0, background: 'var(--accent)', borderRadius: 'var(--r-full)', zIndex: 0 }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{c ?? 'Todos'}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            className="field"
            style={{ minWidth: 200, paddingLeft: '2.25rem' }}
            placeholder="Buscar deck..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {tree ? (
        /* ---- hierarchical tree view ---- */
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="hover-lift flex items-center justify-center gap-2 p-3 text-muted hover:text-fg transition-colors w-full"
            style={{ border: '1px dashed var(--accent)', borderRadius: 'var(--r-md)' }}
          >
            <Plus size={18} />
            <span className="mono text-xs">Criar novo deck</span>
          </button>
          <Panel className="p-2 sm:p-3">
            <DeckTree
              decks={byCategory}
              cardsByDeck={byDeck}
              query={query}
              onConfig={(d) => setSettingsDeck(d)}
              onDelete={deleteDeck}
            />
          </Panel>
          {query && filtered.length === 0 && (
            <p className="text-muted text-sm">Nenhum deck encontrado para “{query}”.</p>
          )}
        </div>
      ) : (
        /* ---- flat grid view (unchanged) ---- */
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={category ?? '__all'}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Create-deck tile sits FIRST. On mobile it's half a deck's height;
                  on desktop the grid stretches it to match the other blocks. */}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="hover-lift flex flex-col items-center justify-center gap-2 p-6 text-muted hover:text-fg min-h-[90px] sm:min-h-[150px] transition-colors"
                style={{ border: '1px dashed var(--accent)', borderRadius: 'var(--r-md)' }}
              >
                <Plus size={26} />
                <span className="mono text-xs">Criar novo deck</span>
              </button>

              {filtered.map((deck) => (
                <DeckCard key={deck.id} deck={deck} cards={byDeck.get(deck.id) ?? []} />
              ))}
            </motion.div>
          </AnimatePresence>

          {filtered.length === 0 && query && (
            <p className="text-muted text-sm mt-4">Nenhum deck encontrado para “{query}”.</p>
          )}
        </>
      )}

      <CreateDeckModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {settingsDeck && (
        <DeckSettingsModal open onClose={() => setSettingsDeck(null)} deck={settingsDeck} />
      )}
    </div>
  );
}
