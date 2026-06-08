import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Settings2, Zap } from 'lucide-react';
import { useCards, useDeckResource } from '../db/hooks';
import { Button } from '../components/Button';
import { Panel } from '../components/Panel';
import { CardRow } from '../features/decks/CardRow';
import { CardEditorModal } from '../features/decks/CardEditorModal';
import { DeckSettingsModal } from '../features/decks/DeckSettingsModal';
import { AlgoBadge } from '../features/decks/AlgoBadge';
import { DeckAvatar } from '../features/decks/deckIcons';
import { ExportButton } from '../features/importer/ExportButton';
import { countCards } from '../lib/deckStats';
import type { Card } from '../db/types';

export function DeckDetail() {
  const { id } = useParams();
  const { data: deck, loading, error, reload } = useDeckResource(id);
  const cards = useCards(id);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const counts = useMemo(
    () => countCards(cards, Date.now(), deck),
    [cards, deck],
  );

  if (loading) {
    return (
      <div className="rise">
        <Link to="/decks" className="mono text-xs text-muted hover:text-fg">
          ← Meus Decks
        </Link>
        <p className="mono text-muted text-sm mt-6">Carregando…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rise">
        <Link to="/decks" className="mono text-xs text-muted hover:text-fg">
          ← Meus Decks
        </Link>
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
        <Link to="/decks" className="mono text-xs text-muted hover:text-fg">
          ← Meus Decks
        </Link>
        <p className="text-muted mt-6">Deck não encontrado.</p>
      </div>
    );
  }

  const pct = counts.total ? Math.round((counts.mastered / counts.total) * 100) : 0;

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
              <Link
                to="/decks"
                className="mono text-[11px] text-muted hover:text-fg inline-flex items-center gap-1 mb-3"
              >
                <ArrowLeft size={13} /> Meus Decks
              </Link>
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

          <div className="flex flex-wrap gap-3 mt-6">
            <Link to={`/review/${deck.id}`} className="btn-mega">
              <Zap size={20} /> Revisar agora
            </Link>
            <Button variant="default" icon={<Plus size={16} />} onClick={addCard}>
              Adicionar card
            </Button>
            <ExportButton deckId={deck.id} size="md" />
          </div>
        </div>
      </section>

      {/* Card list */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="mono text-sm text-muted">
            Cards · {counts.total}
          </h2>
        </div>

        {cards.length === 0 ? (
          <Panel className="p-10 text-center">
            <p className="text-muted">Este deck ainda não tem cards.</p>
            <Button variant="accent" className="mt-4" icon={<Plus size={16} />} onClick={addCard}>
              Adicionar o primeiro card
            </Button>
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                deck={deck}
                onEdit={() => editCard(card)}
              />
            ))}
          </div>
        )}
      </section>

      <CardEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        deckId={deck.id}
        card={editingCard}
        ttsLang={deck.ttsLang}
      />
      <DeckSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        deck={deck}
      />
    </div>
  );
}
