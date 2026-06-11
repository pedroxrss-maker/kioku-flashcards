import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Sparkles } from 'lucide-react';
import { useAllCards, useDecks, useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { groupCardsByDeck } from '../../lib/deckStats';
import { hasHierarchy } from '../../lib/deckTree';
import { Panel } from '../../components/Panel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);

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
    setDeckToDelete(deck);
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

      {/* Deck creation: two matching dashed tiles, above the existing decks. */}
      <div className="grid gap-4 sm:grid-cols-2 mb-5">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="hover-lift flex flex-col items-center justify-center gap-2 p-6 text-muted hover:text-fg min-h-[110px] sm:min-h-[140px] transition-colors"
          style={{ border: '1px dashed var(--accent)', borderRadius: 'var(--r-md)' }}
        >
          <Plus size={26} />
          <span className="mono text-xs">Criar novo deck</span>
        </button>
        <Link
          to="/generate"
          className="hover-lift flex flex-col items-center justify-center gap-2 p-6 text-muted hover:text-fg min-h-[110px] sm:min-h-[140px] transition-colors"
          style={{ border: '1px dashed var(--accent)', borderRadius: 'var(--r-md)' }}
        >
          <Sparkles size={26} />
          <span className="mono text-xs">Gerar deck com IA</span>
        </Link>
      </div>

      {tree ? (
        /* ---- hierarchical tree view ---- */
        <div className="flex flex-col gap-4">
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
        /* ---- flat grid view ---- */
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
      <ConfirmDialog
        open={!!deckToDelete}
        onClose={() => setDeckToDelete(null)}
        onConfirm={() => {
          if (deckToDelete) void repo.deleteDeck(deckToDelete.id);
        }}
        title="Excluir deck"
        message={
          deckToDelete
            ? `Excluir o deck "${deckToDelete.name}" e todos os cards? Esta ação não pode ser desfeita.`
            : ''
        }
      />
    </div>
  );
}
