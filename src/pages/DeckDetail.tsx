import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Folder, Loader2, Play, Plus, Settings2, Volume2, Zap } from 'lucide-react';
import { useAllCards, useCards, useDeckResource, useDecks, useSettings } from '../db/hooks';
import { Button } from '../components/Button';
import { Panel } from '../components/Panel';
import { CardRow } from '../features/decks/CardRow';
import { CardEditorModal } from '../features/decks/CardEditorModal';
import { DeckSettingsModal } from '../features/decks/DeckSettingsModal';
import { AlgoBadge } from '../features/decks/AlgoBadge';
import { DeckAvatar } from '../features/decks/deckIcons';
import { ExportButton } from '../features/importer/ExportButton';
import { countCards, groupCardsByDeck } from '../lib/deckStats';
import {
  aggregateCounts,
  buildDeckTree,
  deckPathOf,
  groupReviewToken,
} from '../lib/deckTree';
import type { DeckTreeNode } from '../lib/deckTree';
import { generateDeckAudio } from '../features/tts/audioGen';
import type { DeckAudioProgress } from '../features/tts/audioGen';
import { isTtsConfigured } from '../features/tts/googleProvider';
import { recordStorageUpload, warnIfStorageHigh } from '../features/media/usage';
import { pushToast } from '../lib/toast';
import type { Card } from '../db/types';

export function DeckDetail() {
  const { id } = useParams();
  const { data: deck, loading, error, reload } = useDeckResource(id);
  const cards = useCards(id);
  const decks = useDecks();
  const allCards = useAllCards();
  const settings = useSettings();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioProg, setAudioProg] = useState<DeckAudioProgress | null>(null);

  const counts = useMemo(
    () => countCards(cards, Date.now(), deck),
    [cards, deck],
  );

  // Direct subdecks of this deck (one level down), for parent decks.
  const subNodes = useMemo<DeckTreeNode[]>(() => {
    if (!deck) return [];
    const tree = buildDeckTree(decks, settings?.deckPaths, groupCardsByDeck(allCards));
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
  }, [deck, decks, allCards, settings?.deckPaths]);

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

  async function genDeckAudio() {
    if (!deck || !settings || audioBusy) return;
    setAudioBusy(true);
    setAudioProg({ done: 0, total: 0 });
    try {
      const res = await generateDeckAudio(deck.id, settings, (p) => setAudioProg(p));
      if (res.bytes > 0) {
        const total = await recordStorageUpload(res.bytes);
        warnIfStorageHigh(total);
      }
      if (res.total === 0) {
        pushToast('info', 'Todos os cards com texto já têm áudio neste deck.');
      } else {
        let msg = `Áudio gerado para ${res.ok} ${res.ok === 1 ? 'card' : 'cards'}.`;
        if (res.failed > 0) msg += ` ${res.failed} ${res.failed === 1 ? 'falhou' : 'falharam'}.`;
        if (res.stopped) msg += ' Geração interrompida (servidor de voz indisponível ou limite atingido).';
        pushToast(res.failed > 0 || res.stopped ? 'info' : 'success', msg);
      }
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Falha ao gerar áudio do deck.');
    } finally {
      setAudioBusy(false);
      setAudioProg(null);
    }
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
            {isTtsConfigured() && (
              <Button
                variant="default"
                icon={audioBusy ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                onClick={genDeckAudio}
                disabled={audioBusy}
              >
                {audioBusy
                  ? `Gerando ${audioProg?.done ?? 0}/${audioProg?.total ?? 0}`
                  : 'Gerar áudio'}
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
              const c = aggregateCounts(n, Date.now());
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
      />
      <DeckSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        deck={deck}
      />
    </div>
  );
}
