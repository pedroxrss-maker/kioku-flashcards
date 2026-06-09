import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { buildMonth, buildYear, dailyAverage, monthLabels } from './compute';
import { computeStreak } from '../../lib/greeting';
import { dayKey } from '../../lib/date';
import type { ReviewLog } from '../../db/types';

const TIER_PCT = [0, 25, 45, 70, 100];
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function tierBg(tier: number): string {
  if (tier === 0) return 'var(--line)';
  return `color-mix(in srgb, var(--accent) ${TIER_PCT[tier]}%, transparent)`;
}

const fmtMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fmtFull = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function motivation(streak: number): string {
  if (streak === 0) return 'Vamos recomeçar. Você consegue!';
  if (streak < 3) return 'Bom começo — continue!';
  if (streak < 7) return 'Continue assim!';
  if (streak < 30) return 'Você está pegando fogo!';
  return 'Imparável. Que sequência!';
}

interface HeatmapProps {
  logs: ReviewLog[];
}

/** Review calendar: a full calendar year (GitHub-style, Jan->Dec) by default,
 *  with a monthly view (per-day counts + tooltips), the streak flame and the
 *  daily average. View/month changes slide + fade. */
export function Heatmap({ logs }: HeatmapProps) {
  const reduce = useReducedMotion();
  const [view, setView] = useState<'year' | 'month'>('year');
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const [dir, setDir] = useState(1); // slide direction for transitions

  // Anki-style hover tooltip: which day + how many cards were reviewed.
  const [tip, setTip] = useState<{ x: number; y: number; date: number; count: number } | null>(null);
  const showTip = (e: React.MouseEvent, date: number, count: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, date, count });
  };
  const hideTip = () => setTip(null);

  const year = new Date().getFullYear();
  const columns = useMemo(() => buildYear(logs, year), [logs, year]);
  const labels = useMemo(() => monthLabels(columns), [columns]);
  const avg = useMemo(() => dailyAverage(columns), [columns]);
  const streak = useMemo(
    () => computeStreak(new Set(logs.map((l) => dayKey(l.reviewedAt)))),
    [logs],
  );

  const monthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);
  const monthCells = useMemo(
    () => buildMonth(logs, monthDate.getFullYear(), monthDate.getMonth()),
    [logs, monthDate],
  );

  const slideVariants = reduce
    ? { enter: { opacity: 1 }, center: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        enter: (d: number) => ({ opacity: 0, x: d * 22 }),
        center: { opacity: 1, x: 0 },
        exit: (d: number) => ({ opacity: 0, x: d * -22 }),
      };
  const animKey = view === 'month' ? `m${monthOffset}` : 'year';

  function goView(v: 'year' | 'month') {
    setDir(v === 'month' ? 1 : -1);
    setView(v);
  }

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          {view === 'month' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDir(-1);
                  setMonthOffset((o) => o - 1);
                }}
                aria-label="Mês anterior"
                className="p-1 rounded-[var(--r-sm)] text-muted hover:text-fg hover:bg-[color:var(--surface-2)] transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-sm font-semibold capitalize" style={{ minWidth: 130, textAlign: 'center' }}>
                {fmtMonth.format(monthDate)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDir(1);
                  setMonthOffset((o) => Math.min(0, o + 1));
                }}
                disabled={monthOffset >= 0}
                aria-label="Próximo mês"
                className="p-1 rounded-[var(--r-sm)] text-muted hover:text-fg hover:bg-[color:var(--surface-2)] transition-colors disabled:opacity-30"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          ) : (
            <span className="mono text-sm font-semibold">{year}</span>
          )}
          <div className="inline-flex rounded-[var(--r-sm)] overflow-hidden" style={{ border: '1px solid var(--line-strong)' }}>
            {(['year', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => goView(v)}
                className="mono text-[11px] px-2.5 py-1 transition-colors"
                style={
                  view === v
                    ? { background: 'var(--accent)', color: 'var(--fg)' }
                    : { background: 'transparent', color: 'var(--muted)' }
                }
              >
                {v === 'year' ? 'Ano' : 'Mês'}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={animKey}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }}
          >
            {view === 'year' ? (
              <div className="overflow-x-auto pb-1">
                <div style={{ minWidth: 'min-content' }}>
                  <div className="flex gap-[3px] mb-1" style={{ marginLeft: 16 }}>
                    {labels.map((lbl, ci) => (
                      <span key={ci} className="mono text-[9px] text-muted capitalize" style={{ width: 11, whiteSpace: 'nowrap' }}>
                        {lbl}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-[3px]">
                    <div className="flex flex-col gap-[3px] mr-1">
                      {DOW.map((d, i) => (
                        <span key={i} className="mono text-[8px] text-muted" style={{ height: 11, lineHeight: '11px', width: 12 }}>
                          {i % 2 === 1 ? d : ''}
                        </span>
                      ))}
                    </div>
                    {columns.map((col, ci) => (
                      <div key={ci} className="flex flex-col gap-[3px]">
                        {col.map((cell) => (
                          <div
                            key={cell.key}
                            onMouseEnter={cell.future ? undefined : (e) => showTip(e, cell.date, cell.count)}
                            onMouseLeave={hideTip}
                            style={{
                              width: 11,
                              height: 11,
                              borderRadius: 2,
                              background: cell.future ? 'transparent' : tierBg(cell.tier),
                              border: '1px solid var(--bg)',
                              opacity: cell.future ? 0.3 : 1,
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                  {DOW.map((d, i) => (
                    <span key={i} className="mono text-[10px] text-muted text-center">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {monthCells.map((cell, i) =>
                    cell ? (
                      <div
                        key={cell.key}
                        onMouseEnter={cell.future ? undefined : (e) => showTip(e, cell.date, cell.count)}
                        onMouseLeave={hideTip}
                        className="relative rounded-[var(--r-sm)]"
                        style={{
                          aspectRatio: '1',
                          background: cell.future ? 'transparent' : tierBg(cell.tier),
                          border: '1px solid var(--line)',
                          opacity: cell.future ? 0.35 : 1,
                        }}
                      >
                        <span
                          className="absolute top-1 right-1.5 mono text-[9px]"
                          style={{ color: cell.tier >= 3 ? 'var(--fg)' : 'var(--muted)' }}
                        >
                          {cell.day}
                        </span>
                        {cell.count > 0 && (
                          <span
                            className="absolute inset-0 flex items-center justify-center display"
                            style={{ fontSize: 15, fontWeight: 700, color: cell.tier >= 3 ? 'var(--fg)' : 'var(--accent)' }}
                          >
                            {cell.count}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div key={`pad-${i}`} />
                    ),
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 mono text-[10px] text-muted">
            <span>Menos</span>
            {[0, 1, 2, 3, 4].map((t) => (
              <span key={t} style={{ width: 11, height: 11, borderRadius: 2, background: tierBg(t) }} />
            ))}
            <span>Mais</span>
          </div>
          <span className="mono text-[11px] text-muted">
            Média: <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{avg.toFixed(1)}</span> cards/dia
          </span>
        </div>
      </div>

      {/* Streak flame + motivation */}
      <div
        className="flex items-center gap-3 shrink-0 lg:flex-col lg:text-center lg:w-44 lg:gap-2 lg:border-l lg:pl-5"
        style={{ borderColor: 'var(--line)' }}
      >
        <Flame size={40} className="flame-anim" style={{ color: 'var(--accent)' }} fill="var(--accent)" />
        <div>
          <p className="display" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
            {streak} <span className="text-muted" style={{ fontSize: 15 }}>{streak === 1 ? 'dia' : 'dias'}</span>
          </p>
          <p className="text-sm text-muted mt-1" style={{ lineHeight: 1.4 }}>{motivation(streak)}</p>
        </div>
      </div>

      {/* Hover tooltip — date + cards reviewed that day. */}
      {tip && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: tip.x,
            top: tip.y - 8,
            transform: 'translate(-50%, -100%)',
            background: 'var(--surface)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--shadow-pop)',
            padding: '6px 10px',
            fontSize: 12,
            lineHeight: 1.45,
            color: 'var(--fg)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 60,
          }}
        >
          {tip.count > 0 ? (
            <>
              <span>
                <b>{tip.count}</b> {tip.count === 1 ? 'card revisado' : 'cards revisados'}
              </span>
              <br />
              <span style={{ color: 'var(--muted)' }}>{cap(fmtFull.format(new Date(tip.date)))}</span>
            </>
          ) : (
            <span style={{ color: 'var(--muted)' }}>
              Nenhuma revisão · {cap(fmtFull.format(new Date(tip.date)))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
