import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flame } from 'lucide-react';
import { buildYearMonths } from './compute';
import { useIsMobile } from '../../lib/useIsMobile';
import { computeStreak } from '../../lib/greeting';
import { dayKey } from '../../lib/date';
import { Modal } from '../../components/Modal';
import type { ReviewLog } from '../../db/types';

const TIER_PCT = [0, 25, 45, 70, 100];
const DOW_MON = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // Monday-first weekday labels
// Compact defaults (Home/Stats). `fill` grows the cells to span the container.
const CELL = 9;
const GAP = 2; // between cells
const MONTH_GAP = 6; // between month blocks

function tierBg(tier: number): string {
  if (tier === 0) return 'var(--line)';
  return `color-mix(in srgb, var(--accent) ${TIER_PCT[tier]}%, transparent)`;
}

const fmtFull = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface HeatmapProps {
  logs: ReviewLog[];
  /** Grow the cells to fill the container's full width (used on a deck page). */
  fill?: boolean;
  /** On mobile, show ONLY the current month; tapping it opens a popup with the
   *  full year. Desktop is unaffected (always the full year). */
  monthOnMobile?: boolean;
}

/** Review calendar: the full year split into month blocks (Jan->Dec), with an
 *  Anki-style hover tooltip (per-day counts) and the daily average. */
export function Heatmap({ logs, fill = false, monthOnMobile = false }: HeatmapProps) {
  const isMobile = useIsMobile();
  const [yearOpen, setYearOpen] = useState(false);

  // Anki-style hover tooltip: which day + how many cards were reviewed.
  const [tip, setTip] = useState<{ x: number; y: number; date: number; count: number } | null>(null);
  const showTip = (e: React.MouseEvent, date: number, count: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, date, count });
  };
  const hideTip = () => setTip(null);

  const year = new Date().getFullYear();
  const months = useMemo(() => buildYearMonths(logs, year), [logs, year]);
  const avg = useMemo(() => {
    let sum = 0;
    let days = 0;
    for (const m of months)
      for (const wk of m.weeks)
        for (const c of wk) {
          if (!c || c.future) continue;
          sum += c.count;
          days += 1;
        }
    return days ? sum / days : 0;
  }, [months]);

  // Mobile (only when asked): show just the current month; tap to open the year.
  const monthMode = monthOnMobile && isMobile;
  // Sequência atual (foguinho) — exibida à direita do bloco do mês no monthMode.
  const streak = useMemo(
    () => computeStreak(new Set(logs.map((l) => dayKey(l.reviewedAt)))),
    [logs],
  );
  const currentMonthIdx = new Date().getMonth();
  const displayMonths = monthMode ? [months[currentMonthIdx]] : months;

  // When filling (deck page) OR in single-month mode, measure the container and
  // grow the cells so the visible month block(s) span its width (square cells).
  const doFill = fill || monthMode;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const totalCols = useMemo(
    () => displayMonths.reduce((s, m) => s + m.weeks.length, 0),
    [displayMonths],
  );
  useLayoutEffect(() => {
    if (!doFill) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doFill]);

  let cell = CELL;
  let gap = GAP;
  let monthGap = MONTH_GAP;
  if (doFill && width > 0 && totalCols > 0) {
    gap = 3;
    monthGap = 8;
    const LABEL_W = 18; // weekday labels column + its right margin
    const nMonths = displayMonths.length;
    const c = Math.floor((width - LABEL_W - (totalCols - nMonths) * gap - (nMonths - 1) * monthGap) / totalCols);
    cell = Math.max(CELL, Math.min(monthMode ? 15 : 18, c));
  }

  const calendar = (
    <div className="overflow-x-auto pb-1">
      <div
        className={`flex items-start ${monthMode ? 'justify-center px-2' : ''}`}
        style={{ minWidth: monthMode ? undefined : 'min-content' }}
      >
        {/* Weekday labels (Monday-first), once on the left. */}
        <div className="flex flex-col mr-1.5" style={{ gap }}>
          {DOW_MON.map((d, i) => (
            <span
              key={i}
              className="mono text-[8px] text-muted"
              style={{ height: cell, lineHeight: `${cell}px`, width: 10 }}
            >
              {d}
            </span>
          ))}
        </div>
        {/* One block per month, separated by a gap. */}
        <div className="flex" style={{ gap: monthGap }}>
          {displayMonths.map((blk) => (
            <div key={blk.month} className="flex flex-col">
              <div className="flex" style={{ gap }}>
                {blk.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col" style={{ gap }}>
                    {week.map((c, ci) =>
                      c ? (
                        <div
                          key={c.key}
                          onMouseEnter={c.future ? undefined : (e) => showTip(e, c.date, c.count)}
                          onMouseLeave={hideTip}
                          style={{
                            width: cell,
                            height: cell,
                            borderRadius: 2,
                            background: c.future ? 'transparent' : tierBg(c.tier),
                            border: '1px solid var(--bg)',
                            opacity: c.future ? 0.3 : 1,
                          }}
                        />
                      ) : (
                        <div key={`e${wi}-${ci}`} style={{ width: cell, height: cell }} />
                      ),
                    )}
                  </div>
                ))}
              </div>
              <span className="mono text-[9px] text-muted capitalize text-center mt-1">
                {blk.label}
              </span>
            </div>
          ))}
        </div>
        {/* Foguinho de revisões: sequência atual, à direita do bloco do mês. */}
        {monthMode && (
          <div className="self-center flex flex-col items-center justify-center ml-8">
            <Flame
              size={36}
              className={streak > 0 ? 'text-accent flame-anim' : 'text-muted'}
            />
            <span
              className="mono text-xl font-bold leading-none mt-1"
              style={{ color: streak > 0 ? 'var(--fg)' : 'var(--muted)' }}
            >
              {streak}
            </span>
            <span className="mono text-[9px] text-muted mt-0.5">
              {streak === 1 ? 'dia' : 'dias'}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className="min-w-0">
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="mono text-sm font-semibold">
            {monthMode ? `${cap(months[currentMonthIdx].label)} ${year}` : year}
          </span>
          {monthMode && (
            <span className="mono text-[10px] text-muted">toque para ver o ano</span>
          )}
        </div>

        {monthMode ? (
          <button
            type="button"
            onClick={() => setYearOpen(true)}
            aria-label="Ver o ano inteiro"
            className="w-full text-left rounded-[var(--r-sm)] transition-colors hover:bg-[color:var(--surface-2)]"
          >
            {calendar}
          </button>
        ) : (
          calendar
        )}

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

      {/* Hover tooltip — date + cards reviewed that day. Portaled to <body> so
          it anchors to the hovered cell regardless of ancestor transforms. */}
      {tip && createPortal(
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
        </div>,
        document.body,
      )}

      {/* Mobile month -> full-year popup. The inner Heatmap renders the whole year
          (monthOnMobile defaults to false), fitting the modal width via `fill`. */}
      {monthOnMobile && (
        <Modal open={yearOpen} onClose={() => setYearOpen(false)} title="Mapa de revisões" width={560}>
          <Heatmap logs={logs} fill />
        </Modal>
      )}
    </div>
  );
}
