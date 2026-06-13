import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, Plus, Search, Sparkles } from 'lucide-react';
import { useAllCards, useDecks } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { groupCardsByDeck } from '../../lib/deckStats';
import { Panel } from '../../components/Panel';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DeckTree, DECK_TABLE } from './DeckTree';
import { CreateDeckModal } from './CreateDeckModal';
import { DeckSettingsModal } from './DeckSettingsModal';
import { cn } from '../../lib/cn';
import type { Deck } from '../../db/types';

/** Violet used only for the "Gerar deck com IA" tile (the app accent is orange). */
const AI_PURPLE = '#8b5cf6';

/** Directional slide between category sections (enters from the side you moved toward). */
const SECTION_SLIDE = {
  enter: (d: number) => ({ x: d * 28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -28, opacity: 0 }),
};

export function DeckBrowser() {
  const decks = useDecks();
  const allCards = useAllCards();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [catDir, setCatDir] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsDeck, setSettingsDeck] = useState<Deck | null>(null);
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);

  const byDeck = useMemo(() => groupCardsByDeck(allCards), [allCards]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    decks.forEach((d) => d.category && set.add(d.category));
    return [...set].sort();
  }, [decks]);

  const byCategory = decks.filter((d) => !category || d.category === category);
  const filtered = byCategory.filter((d) =>
    d.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  const orderedCats = [null, ...categories];
  // Slide the section toward the side of the pill that was picked.
  function selectCategory(c: string | null) {
    if (c === category) return;
    const to = orderedCats.indexOf(c);
    const from = orderedCats.indexOf(category);
    setCatDir(to > from ? 1 : -1);
    setCategory(c);
  }

  return (
    <div>
      {/* Category filters + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Category filters: a horizontal scrollable carousel (no wrap). */}
        <div className="flex flex-nowrap gap-2 flex-1 overflow-x-auto hide-scrollbar">
          {[null, ...categories].map((c) => {
            const active = category === c;
            return (
              <button
                key={c ?? '__all'}
                type="button"
                onClick={() => selectCategory(c)}
                className="pill shrink-0"
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
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'var(--accent)',
                      borderRadius: 'var(--r-full)',
                      zIndex: 0,
                    }}
                  />
                )}
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  {c === null && <LayoutGrid size={14} />}
                  {c ?? 'Todos'}
                </span>
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
            style={{ minWidth: 220, paddingLeft: '2.25rem', paddingRight: '3rem' }}
            placeholder="Buscar deck..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] mono pointer-events-none"
            style={{
              color: 'var(--muted)',
              border: '1px solid var(--line-strong)',
              borderRadius: 6,
              padding: '1px 6px',
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Create / generate — two prominent cards */}
      <div className="grid gap-4 sm:grid-cols-2 mb-5">
        <HeroCard
          color="var(--accent)"
          onClick={() => setCreateOpen(true)}
          icon={<Plus size={26} />}
          iconShape="circle"
          title="Criar novo deck"
          subtitle="Comece do zero"
        />
        <HeroCard
          color={AI_PURPLE}
          to="/generate"
          icon={<Sparkles size={24} />}
          iconShape="tile"
          title="Gerar deck com IA"
          subtitle="Descreva o que você quer estudar"
        />
      </div>

      {/* Deck table */}
      <Panel className="p-1.5 sm:p-2">
        {decks.length === 0 ? (
          <p className="text-muted text-sm text-center py-10">
            Você ainda não tem decks. Crie o primeiro acima.
          </p>
        ) : (
          <>
            {/* Column header (desktop only) */}
            <div
              className="hidden sm:flex items-center gap-2 sm:gap-3 px-3 pt-2 pb-2.5"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              <span className="flex-1 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                Nome do deck
              </span>
              <div className={DECK_TABLE.countGroup}>
                <span
                  className={cn(DECK_TABLE.countCell, 'text-[11px] font-semibold')}
                  style={{ color: 'var(--accent-blue)' }}
                >
                  Novas
                </span>
                <span
                  className={cn(DECK_TABLE.countCell, 'text-[11px] font-semibold')}
                  style={{ color: 'var(--accent)' }}
                >
                  Aprender
                </span>
                <span
                  className={cn(DECK_TABLE.countCell, 'text-[11px] font-semibold')}
                  style={{ color: 'var(--accent-green)' }}
                >
                  Revisar
                </span>
              </div>
              <span
                className={cn(DECK_TABLE.actionsW, 'text-center text-[11px] font-semibold')}
                style={{ color: 'var(--muted)' }}
              >
                Ações
              </span>
            </div>

            {/* Sliding sections: a directional swap when the category changes.
                overflow-x clip hides the horizontal slide; overflow-y stays
                visible so an open row "⋮" menu can spill past the panel. */}
            <div style={{ position: 'relative', overflowX: 'clip' }}>
              <AnimatePresence mode="popLayout" custom={catDir} initial={false}>
                <motion.div
                  key={category ?? '__all'}
                  custom={catDir}
                  variants={SECTION_SLIDE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="pt-1"
                >
                  <DeckTree
                    variant="table"
                    decks={byCategory}
                    cardsByDeck={byDeck}
                    query={query}
                    onConfig={(d) => setSettingsDeck(d)}
                    onDelete={(d) => setDeckToDelete(d)}
                  />
                  {query && filtered.length === 0 && (
                    <p className="text-muted text-sm text-center py-8">
                      Nenhum deck encontrado para “{query}”.
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </Panel>

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

/* ----------------------------------------------------------------- hero --- */
function HeroCard({
  color,
  to,
  onClick,
  icon,
  iconShape,
  title,
  subtitle,
}: {
  color: string;
  to?: string;
  onClick?: () => void;
  icon: ReactNode;
  iconShape: 'circle' | 'tile';
  title: string;
  subtitle: string;
}) {
  const inner = (
    <>
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, ${color} 22%, transparent), transparent 60%)`,
        }}
      />
      {/* Ink-drop fill that floods the surface on hover (see .hero-ink in globals.css). */}
      <span aria-hidden className="hero-ink" style={{ '--ink': color } as CSSProperties} />
      {/* Mobile: compact horizontal row (about half height); sm+: centered stack. */}
      <span className="relative flex flex-row sm:flex-col items-center text-left sm:text-center gap-3">
        <span
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: iconShape === 'circle' ? '50%' : 'var(--r-md)',
            background:
              iconShape === 'circle' ? color : `color-mix(in srgb, ${color} 22%, var(--surface-2))`,
            color: iconShape === 'circle' ? '#fff' : color,
            border:
              iconShape === 'tile'
                ? `1px solid color-mix(in srgb, ${color} 45%, transparent)`
                : undefined,
            boxShadow: `0 10px 26px color-mix(in srgb, ${color} 40%, transparent)`,
          }}
        >
          {icon}
        </span>
        <span>
          <span className="block font-bold" style={{ fontSize: 18, color: 'var(--fg)' }}>
            {title}
          </span>
          <span className="block text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {subtitle}
          </span>
        </span>
      </span>
    </>
  );

  const style = {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    borderRadius: 'var(--r-md)',
    border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
    background: `linear-gradient(160deg, color-mix(in srgb, ${color} 12%, var(--surface)) 0%, var(--surface) 70%)`,
  };
  // Half-height on mobile (compact padding, no min-height); full card on sm+.
  const className =
    'hero-card hover-lift flex items-center justify-start sm:justify-center px-5 py-3 sm:px-6 sm:py-7 sm:min-h-[150px]';

  return to ? (
    <Link to={to} className={className} style={style}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className} style={style}>
      {inner}
    </button>
  );
}
