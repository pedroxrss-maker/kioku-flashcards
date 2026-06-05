import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Layers, Sparkles, Zap } from 'lucide-react';
import { useAllCards, useAllLogs, useDecks } from '../db/hooks';
import { StatTile } from '../components/StatTile';
import { DeckBrowser } from '../features/decks/DeckBrowser';
import { countCards, groupCardsByDeck } from '../lib/deckStats';
import { computeStreak, greeting } from '../lib/greeting';
import { dayKey } from '../lib/date';
import type { Deck } from '../db/types';

interface DueDeck {
  deck: Deck;
  due: number;
  mastered: number;
  total: number;
}

export function Home() {
  const decks = useDecks();
  const allCards = useAllCards();
  const logs = useAllLogs();

  const byDeck = useMemo(() => groupCardsByDeck(allCards), [allCards]);

  const { mostDue, totalMastered } = useMemo(() => {
    const now = Date.now();
    let best: DueDeck | null = null;
    let mastered = 0;
    for (const deck of decks) {
      const counts = countCards(byDeck.get(deck.id) ?? [], now, deck);
      mastered += counts.mastered;
      if (counts.due > 0 && (!best || counts.due > best.due)) {
        best = { deck, due: counts.due, mastered: counts.mastered, total: counts.total };
      }
    }
    return { mostDue: best, totalMastered: mastered };
  }, [decks, byDeck]);

  const streak = useMemo(() => {
    const keys = new Set(logs.map((l) => dayKey(l.reviewedAt)));
    return computeStreak(keys);
  }, [logs]);

  return (
    <div className="flex flex-col gap-8 rise">
      <header>
        <p className="mono text-xs text-accent mb-2">
          {new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <h1
          className="display"
          style={{ fontSize: 'clamp(34px, 6vw, 52px)', fontWeight: 900 }}
        >
          {greeting()}
          <span className="text-accent">.</span>
        </h1>
      </header>

      {/* Continue reviewing banner */}
      {mostDue ? (
        <section
          className="relative overflow-hidden p-6 md:p-8"
          style={{ border: `2px solid ${mostDue.deck.color}`, background: 'var(--surface)' }}
        >
          <div
            aria-hidden
            className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-20 blur-2xl"
            style={{ background: mostDue.deck.color }}
          />
          <div className="relative">
            <p className="mono text-xs mb-2" style={{ color: mostDue.deck.color }}>
              Continuar revisando
            </p>
            <h2 className="display text-2xl md:text-3xl">{mostDue.deck.name}</h2>
            <div className="mt-4 max-w-md">
              <div className="flex justify-between mono text-[10px] text-muted mb-1.5">
                <span>{mostDue.due} cards a revisar</span>
                <span>
                  {mostDue.total
                    ? Math.round((mostDue.mastered / mostDue.total) * 100)
                    : 0}
                  % dominado
                </span>
              </div>
              <div className="h-2 w-full" style={{ background: 'var(--line)' }}>
                <div
                  style={{
                    width: `${mostDue.total ? (mostDue.mastered / mostDue.total) * 100 : 0}%`,
                    height: '100%',
                    background: mostDue.deck.color,
                  }}
                />
              </div>
            </div>
            <Link to={`/review/${mostDue.deck.id}`} className="btn-mega mt-6">
              <Zap size={20} /> Revisar agora
            </Link>
          </div>
        </section>
      ) : (
        <section
          className="p-8 text-center"
          style={{ border: '2px solid var(--line)', background: 'var(--surface)' }}
        >
          <Sparkles className="mx-auto text-accent mb-3" size={28} />
          <h2 className="display text-2xl">Tudo em dia</h2>
          <p className="text-muted mt-2">
            Nenhuma revisão pendente. Que tal adicionar novos cards?
          </p>
        </section>
      )}

      {/* Stat tiles */}
      <section className="grid grid-cols-3 gap-3 md:gap-4">
        <StatTile label="Decks" value={decks.length} caption="ativos" />
        <StatTile
          label="Cards dominados"
          value={totalMastered}
          caption="intervalo ≥ 21 dias"
          accent="var(--accent-green)"
        />
        <StatTile
          label="Dias seguidos"
          value={
            <span className="inline-flex items-center gap-2">
              {streak}
              {streak > 0 && <Flame size={26} className="text-accent" />}
            </span>
          }
          caption="sequência de estudo"
        />
      </section>

      {/* Deck browser */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Layers size={18} className="text-muted" />
          <h2 className="mono text-sm">Meus decks</h2>
        </div>
        <DeckBrowser />
      </section>
    </div>
  );
}
