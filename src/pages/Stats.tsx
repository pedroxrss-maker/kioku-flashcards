import { useEffect, useMemo, useRef } from 'react';
import { Activity, CalendarDays, Flame, PieChart, Trophy } from 'lucide-react';
import { useAllCards, useAllLogs, useDecks } from '../db/hooks';
import { evaluateAchievements } from '../features/gamification/achievements';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { StatTile } from '../components/StatTile';
import { Heatmap } from '../features/stats/Heatmap';
import { DailyBars } from '../features/stats/DailyBars';
import { CardCountsPie } from '../features/stats/CardCountsPie';
import { sessionsFromLogs, statsSummary } from '../features/stats/compute';
import { countCardStates, countCards, groupCardsByDeck } from '../lib/deckStats';
import { computeStreak } from '../lib/greeting';
import { DAY_MS, dayKey, startOfLocalDay } from '../lib/date';

function fmtDur(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

const relFmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

function relDate(ts: number): string {
  const days = Math.round((startOfLocalDay(ts) - startOfLocalDay()) / DAY_MS);
  if (days === 0) return 'Hoje';
  if (days === -1) return 'Ontem';
  if (days > -7) return relFmt.format(days, 'day');
  return shortDate.format(ts);
}

function scoreColor(pct: number): string {
  if (pct >= 80) return 'var(--accent-green)';
  if (pct >= 50) return 'var(--accent-amber)';
  return 'var(--accent)';
}

export function Stats() {
  const logs = useAllLogs();
  const cards = useAllCards();
  const decks = useDecks();

  // Stats is the ONLY place that loads card rows for maturity. Since they're here
  // anyway, run a card-aware achievement pass once so maturity / image / audio
  // badges unlock here (on-demand) — they're intentionally skipped at startup.
  const cardAwareEvalDone = useRef(false);
  useEffect(() => {
    if (cardAwareEvalDone.current || cards.length === 0) return;
    cardAwareEvalDone.current = true;
    void evaluateAchievements({ cards });
  }, [cards]);

  const byDeck = useMemo(() => groupCardsByDeck(cards), [cards]);
  const deckById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const cardStates = useMemo(() => countCardStates(cards, deckById), [cards, deckById]);
  const summary = useMemo(() => statsSummary(logs), [logs]);
  const streak = useMemo(
    () => computeStreak(new Set(logs.map((l) => dayKey(l.reviewedAt)))),
    [logs],
  );
  const totalMastered = useMemo(
    () =>
      decks.reduce(
        (acc, d) => acc + countCards(byDeck.get(d.id) ?? [], Date.now(), d).mastered,
        0,
      ),
    [decks, byDeck],
  );
  const sessions = useMemo(() => sessionsFromLogs(logs, decks, 10), [logs, decks]);

  const deckProgress = decks
    .map((d) => {
      const c = countCards(byDeck.get(d.id) ?? [], Date.now(), d);
      return { deck: d, ...c, pct: c.total ? Math.round((c.mastered / c.total) * 100) : 0 };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <div className="rise flex flex-col gap-7 [&>*]:min-w-0">
      <PageHeader title="Estatísticas" subtitle="Seu progresso ao longo do tempo." />

      {/* Mapa de revisões no TOPO, antes de qualquer dado (mobile e desktop). No
          mobile mostra só o mês atual; toque abre o ano num popup. */}
      <Panel className="p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-muted" />
          <h2 className="mono text-sm text-muted">Mapa de revisões</h2>
        </div>
        <Heatmap logs={logs} fill monthOnMobile />
      </Panel>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatTile label="Revisões totais" value={summary.totalReviews} caption="desde o início" />
        <StatTile
          label="Aproveitamento"
          value={`${summary.accuracyPct}%`}
          caption="acertos / total"
          accent={summary.accuracyPct >= 80 ? 'var(--accent-green)' : undefined}
        />
        <StatTile label="Cards dominados" value={totalMastered} caption="intervalo ≥ 21 d" accent="var(--accent-green)" />
        <StatTile
          label="Dias seguidos"
          value={
            <span className="inline-flex items-center gap-2">
              {streak}
              {streak > 0 && <Flame size={24} className="text-accent flame-anim" />}
            </span>
          }
          caption="sequência"
        />
      </section>

      <Panel className="p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <PieChart size={16} className="text-muted" />
          <h2 className="mono text-sm text-muted">Cards por estado</h2>
        </div>
        <CardCountsPie counts={cardStates} />
      </Panel>

      <Panel className="p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-muted" />
          <h2 className="mono text-sm text-muted">Desempenho diário · 14 dias</h2>
        </div>
        <DailyBars logs={logs} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 [&>*]:min-w-0">
        {/* Per-deck progress */}
        <Panel className="p-5 md:p-6">
          <h2 className="mono text-sm text-muted mb-4">Progresso por deck</h2>
          {deckProgress.length === 0 ? (
            <p className="text-muted text-sm">Nenhum deck ainda.</p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {deckProgress.map(({ deck, mastered, total, pct }) => (
                <div key={deck.id}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 rounded-full" style={{ width: 9, height: 9, background: deck.color }} />
                      <span className="truncate text-sm">{deck.name}</span>
                    </span>
                    <span className="mono text-[10px] text-muted shrink-0">
                      {mastered}/{total} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full" style={{ background: 'var(--line)' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: deck.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Recent sessions */}
        <Panel className="p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={16} className="text-muted" />
            <h2 className="mono text-sm text-muted">Sessões recentes</h2>
          </div>
          {sessions.length === 0 ? (
            <p className="text-muted text-sm">Nenhuma sessão registrada ainda.</p>
          ) : (
            <div className="flex flex-col">
              {sessions.map((s, i) => (
                <div
                  key={`${s.deckId}-${s.start}`}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}
                >
                  <span className="shrink-0 rounded-full" style={{ width: 9, height: 9, background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{s.deckName}</p>
                    <p className="mono text-[10px] text-muted">
                      {relDate(s.start)} · {timeFmt.format(s.start)} · {s.count} cards · {fmtDur(s.durationMs)}
                    </p>
                  </div>
                  <span
                    className="pill shrink-0"
                    style={{ fontSize: 10, padding: '3px 9px', color: scoreColor(s.scorePct), borderColor: scoreColor(s.scorePct) }}
                  >
                    {s.scorePct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
