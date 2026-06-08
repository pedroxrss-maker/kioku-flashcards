import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap } from 'lucide-react';
import { useAllCards, useDecks } from '../db/hooks';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { countCards, groupCardsByDeck } from '../lib/deckStats';

export function ReviewHub() {
  const decks = useDecks();
  const allCards = useAllCards();
  const byDeck = useMemo(() => groupCardsByDeck(allCards), [allCards]);
  const now = Date.now();

  const rows = decks
    .map((deck) => ({
      deck,
      counts: countCards(byDeck.get(deck.id) ?? [], now, deck),
    }))
    .sort((a, b) => b.counts.due - a.counts.due);

  return (
    <div className="rise">
      <PageHeader
        title="Revisão"
        subtitle="Escolha um deck para começar a revisar."
      />

      {decks.length === 0 ? (
        <p className="text-muted">Crie um deck primeiro em “Meus Decks”.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(({ deck, counts }) => (
            <Panel
              key={deck.id}
              accentStrip={deck.color}
              className="flex items-center gap-4 p-4 pr-5"
            >
              <Link
                to={`/decks/${deck.id}`}
                className="flex items-center gap-4 min-w-0 flex-1 group"
              >
                <span
                  className="shrink-0 rounded-full"
                  style={{ width: 12, height: 12, background: deck.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate group-hover:text-accent transition-colors">{deck.name}</p>
                  <p className="mono text-[11px] text-muted mt-0.5">
                    {counts.due > 0
                      ? `${counts.due} a revisar · ${counts.newCount} novos`
                      : 'Em dia'}
                  </p>
                </div>
              </Link>
              {counts.due > 0 ? (
                <Link to={`/review/${deck.id}`} className="btn btn-accent btn-sm">
                  <Zap size={15} /> Revisar
                </Link>
              ) : (
                <span className="pill pill-muted" style={{ color: 'var(--accent-green)', borderColor: 'var(--accent-green)' }}>
                  <Check size={13} /> Em dia
                </span>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
