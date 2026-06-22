import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CalendarDays, Folder, Play, Plus, Search, Settings2, Volume2, Zap } from 'lucide-react';
import { BackLink } from '../components/BackLink';
import { useCards, useDeckCounts, useDeckRecentLogs, useDeckResource, useDecks, useSettings } from '../db/hooks';
import { Button } from '../components/Button';
import { Panel } from '../components/Panel';
import { Heatmap } from '../features/stats/Heatmap';
import { CardRow } from '../features/decks/CardRow';
import { CardEditorModal } from '../features/decks/CardEditorModal';
import { DeckSettingsModal } from '../features/decks/DeckSettingsModal';
import { AlgoBadge } from '../features/decks/AlgoBadge';
import { DeckAvatar } from '../features/decks/deckIcons';
import { ExportButton } from '../features/importer/ExportButton';
import { countCards } from '../lib/deckStats';
import { stripHtml } from '../lib/text';
import {
  aggregateCountSet,
  buildDeckTree,
  deckPathOf,
  groupReviewToken,
} from '../lib/deckTree';
import type { DeckTreeNode } from '../lib/deckTree';

// Bounded recent window for THIS deck's heatmap (no full review-log download).
const DECK_LOG_DAYS = 400;
import { isTtsConfigured } from '../features/tts/googleProvider';
import { GenerateDeckAudioDialog } from '../features/tts/GenerateDeckAudioDialog';
import type { Card } from '../db/types';

export function DeckDetail() {
  const { id } = useParams();
  const { data: deck, loading, error, reload } = useDeckResource(id);
  const cards = useCards(id);
  const decks = useDecks();
  const settings = useSettings();
  const deckIds = useMemo(() => decks.map((d) => d.id), [decks]);
  // Subdeck counts via server-side HEAD counts (no card rows for the subdeck list).
  const deckCounts = useDeckCounts(deckIds);
  // Reviews of THIS deck for its heatmap — bounded recent window (no full log pull).
  const deckLogs = useDeckRecentLogs(id, DECK_LOG_DAYS);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [cardQuery, setCardQuery] = useState('');

  // "Ver no painel": the card editor navigates here with a focusCardId in the
  // route state. Once that card's row is on screen, scroll to it and play the
  // jump bounce so the user sees where it sits among the others.
  const location = useLocation();
  const focusCardId = (location.state as { focusCardId?: string } | null)?.focusCardId ?? null;
  const [jumpId, setJumpId] = useState<string | null>(null);
  const handledFocusKey = useRef<string | null>(null);

  const counts = useMemo(
    () => countCards(cards, Date.now(), deck),
    [cards, deck],
  );

  // Direct subdecks of this deck (one level down), for parent decks.
  const subNodes = useMemo<DeckTreeNode[]>(() => {
    if (!deck) return [];
    const tree = buildDeckTree(decks, settings?.deckPaths, new Map<string, Card[]>(), settings?.deckOrder);
    const path = deckPathOf(deck, settings?.deckPaths);
    const find = (nodes: DeckTreeNode[]): DeckTreeNode | null => {
      for (const n of nodes) {
        if (n.path === path) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    return find(tree)?.children ?? [];
  }, [deck, decks, settings?.deckPaths, settings?.deckOrder]);

  useEffect(() => {
    if (!focusCardId) return;
    if (handledFocusKey.current === location.key) return; // handled this navigation
    if (!cards.some((c) => c.id === focusCardId)) return; // wait for the deck's cards to load
    handledFocusKey.current = location.key;
    // Next frame: the row is in the DOM; scroll to it and arm the jump (cleared
    // by the wrapper's onAnimationEnd, so no timer fights effect re-runs).
    requestAnimationFrame(() => {
      document
        .getElementById(`card-${focusCardId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setJumpId(focusCardId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCardId, location.key, cards.length]);

  if (loading) {
    return (
      <div className="rise">
        <BackLink to="/decks">Biblioteca</BackLink>
        <p className="mono text-muted text-sm mt-6">Carregando…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rise">
        <BackLink to="/decks">Biblioteca</BackLink>
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-muted">Não foi possível carregar. Tente novamente.</p>
          <button type="button" className="btn btn-accent" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="rise">
        <BackLink to="/decks">Biblioteca</BackLink>
        <p className="text-muted mt-6">Deck não encontrado.</p>
      </div>
    );
  }

  const pct = counts.total ? Math.round((counts.mastered / counts.total) * 100) : 0;
  const cardQ = cardQuery.trim().toLowerCase();
  const visibleCards = cardQ
    ? cards.filter((c) => `${stripHtml(c.front)} ${stripHtml(c.back)}`.toLowerCase().includes(cardQ))
    : cards;

  function addCard() {
    setEditingCard(null);
    setEditorOpen(true);
  }
  function editCard(card: Card) {
    setEditingCard(card);
    setEditorOpen(true);
  }


  return (
    <div className="rise flex flex-col gap-7">
      {/* Hero */}
      <section
        className="relative overflow-hidden p-6 md:p-8"
        style={{
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          background: `linear-gradient(135deg, color-mix(in srgb, ${deck.color} 14%, var(--surface)), var(--surface))`,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          aria-hidden
          className="absolute -right-20 -top-20 h-60 w-60 rounded-full opacity-20 blur-2xl"
          style={{ background: deck.color }}
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <BackLink to="/decks" className="mb-3">
                Biblioteca
              </BackLink>
              <div className="flex items-center gap-3">
                <DeckAvatar deck={deck} size={52} />
                <div className="min-w-0">
                  {deck.category && (
                    <p className="mono text-[11px] mb-1" style={{ color: deck.color }}>
                      {deck.category}
                    </p>
                  )}
                  <h1 className="display" style={{ fontSize: 'clamp(28px, 5vw, 44px)' }}>
                    {deck.name}
                  </h1>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Configurações do deck"
              className="p-2 text-muted hover:text-fg transition-colors shrink-0"
              style={{ border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}
            >
              <Settings2 size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4 mt-4 mono text-[11px] text-muted flex-wrap">
            <span>{counts.total} cards</span>
            <span>·</span>
            <span style={{ color: 'var(--accent-blue)' }}>{counts.newCount} novos</span>
            <span style={{ color: 'var(--accent-green)' }}>{counts.review} em revisão</span>
            <AlgoBadge algorithm={deck.algorithm} />
          </div>

          <div className="mt-4 max-w-md">
            <div className="flex justify-between mono text-[10px] text-muted mb-1.5">
              <span>Dominado</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 w-full" style={{ background: 'var(--line)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: deck.color }} />
            </div>
          </div>

          {/* Mobile: 2x2 grid of icon-top action tiles. */}
          <div className="grid grid-cols-2 gap-3 mt-6 sm:hidden">
            <Link
              to={`/review/${deck.id}`}
              className="deck-action-tile deck-action-tile-accent"
            >
              <Zap size={18} />
              <span>Revisar agora</span>
            </Link>
            <button type="button" onClick={addCard} className="deck-action-tile">
              <Plus size={18} />
              <span>Adicionar card</span>
            </button>
            <ExportButton deckId={deck.id} tile />
            {isTtsConfigured() && (
              <button
                type="button"
                onClick={() => setAudioDialogOpen(true)}
                className="deck-action-tile"
              >
                <Volume2 size={18} />
                <span>Gerar áudio</span>
              </button>
            )}
          </div>

          {/* Desktop: the original button row. */}
          <div className="hidden sm:flex flex-wrap gap-3 mt-6">
            <Link to={`/review/${deck.id}`} className="btn-mega">
              <Zap size={20} /> Revisar agora
            </Link>
            <Button variant="default" icon={<Plus size={16} />} onClick={addCard}>
              Adicionar card
            </Button>
            <ExportButton deckId={deck.id} size="md" />
            {isTtsConfigured() && (
              <Button
                variant="default"
                icon={<Volume2 size={16} />}
                onClick={() => setAudioDialogOpen(true)}
              >
                Gerar áudio
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Subdecks (parent decks only) */}
      {subNodes.length > 0 && (
        <section>
          <h2 className="mono text-sm text-muted mb-4">Subdecks · {subNodes.length}</h2>
          <div className="flex flex-col gap-2">
            {subNodes.map((n) => {
              const c = aggregateCountSet(n, deckCounts);
              const target = n.deck ? n.deck.id : groupReviewToken(n.path);
              const accent = n.deck?.color ?? 'var(--accent)';
              return (
                <div
                  key={n.path}
                  className="flex items-center gap-3 surface p-3 transition-colors hover:bg-[color:var(--surface-2)]"
                >
                  {n.deck ? (
                    <DeckAvatar deck={n.deck} size={36} />
                  ) : (
                    <span
                      className="flex items-center justify-center rounded-[var(--r-sm)] shrink-0"
                      style={{ width: 36, height: 36, background: 'var(--surface-2)', color: 'var(--muted)' }}
                    >
                      <Folder size={18} />
                    </span>
                  )}
                  {n.deck ? (
                    <Link to={`/decks/${n.deck.id}`} className="min-w-0 flex-1">
                      <p className="font-semibold truncate leading-tight">{n.name}</p>
                      <p className="text-xs text-muted truncate">
                        {c.total} cards
                        {c.due > 0 && <span style={{ color: accent }}> · {c.due} a revisar</span>}
                      </p>
                    </Link>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate leading-tight">{n.name}</p>
                      <p className="text-xs text-muted truncate">
                        {c.total} cards
                        {c.due > 0 && <span style={{ color: accent }}> · {c.due} a revisar</span>}
                      </p>
                    </div>
                  )}
                  <Link
                    to={`/review/${encodeURIComponent(target)}`}
                    className="btn btn-accent btn-sm shrink-0"
                  >
                    <Play size={14} /> <span className="hidden sm:inline">Estudar</span>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Review heatmap for THIS deck */}
      <Panel className="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-muted" />
          <h2 className="mono text-sm text-muted">Mapa de revisões deste deck</h2>
        </div>
        <Heatmap logs={deckLogs} fill />
      </Panel>

      {/* Card list */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="mono text-sm text-muted">
            Cards · {counts.total}
          </h2>
          {cards.length > 0 && (
            <div className="relative w-full sm:w-auto sm:min-w-[240px]">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                className="field w-full"
                style={{ paddingLeft: '2.25rem' }}
                placeholder="Buscar card..."
                value={cardQuery}
                onChange={(e) => setCardQuery(e.target.value)}
              />
            </div>
          )}
        </div>

        {cards.length === 0 ? (
          <Panel className="p-10 text-center">
            <p className="text-muted">Este deck ainda não tem cards.</p>
            <Button variant="accent" className="mt-4" icon={<Plus size={16} />} onClick={addCard}>
              Adicionar o primeiro card
            </Button>
          </Panel>
        ) : visibleCards.length === 0 ? (
          <Panel className="p-8 text-center">
            <p className="text-muted">Nenhum card encontrado para “{cardQuery}”.</p>
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleCards.map((card) => (
              <div
                key={card.id}
                id={`card-${card.id}`}
                className={jumpId === card.id ? 'card-jump' : undefined}
                onAnimationEnd={
                  jumpId === card.id
                    ? (e) => {
                        if (e.currentTarget === e.target) setJumpId(null);
                      }
                    : undefined
                }
                style={{ scrollMarginBlock: 24 }}
              >
                <CardRow card={card} deck={deck} onEdit={() => editCard(card)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <CardEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        deckId={deck.id}
        card={editingCard}
      />
      <DeckSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        deck={deck}
      />
      <GenerateDeckAudioDialog
        open={audioDialogOpen}
        onClose={() => setAudioDialogOpen(false)}
        deckId={deck.id}
        deckName={deck.name}
      />
    </div>
  );
}
