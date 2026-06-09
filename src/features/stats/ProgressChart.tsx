import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { progressStats } from './compute';
import type { ReviewLog } from '../../db/types';

const PERIODS = [7, 14, 30] as const;
type Period = (typeof PERIODS)[number];

/* SVG geometry (viewBox units; the svg scales to its container width). Wide,
 * short aspect so the chart fills its half of the block without towering over
 * the review map beside it. */
const VBW = 500;
const VBH = 190;
const PAD_L = 30;
const PAD_R = 12;
const PAD_T = 22;
const PAD_B = 22;
const PLOT_W = VBW - PAD_L - PAD_R;
const PLOT_H = VBH - PAD_T - PAD_B;

/** Round a max up to a clean ceiling with integer gridline steps. */
function niceScale(rawMax: number): { yMax: number; step: number } {
  const candidates = [4, 5, 8, 10, 20, 25, 40, 50, 80, 100, 150, 200, 300, 400, 500, 800, 1000];
  const yMax = candidates.find((c) => rawMax <= c) ?? Math.ceil(rawMax / 500) * 500;
  return { yMax, step: yMax % 4 === 0 ? yMax / 4 : yMax / 5 };
}

/** Catmull-Rom → cubic Bézier, for a smooth line through the points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.16;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * "Seu progresso": cards reviewed per day over a chosen window, as a smooth
 * area+line chart in the brand accent, with a hover tooltip. Lives beside the
 * review map. Shadows/effects mirror the rest of the app (gradient fill,
 * --shadow-pop on the tooltip).
 */
export function ProgressChart({ logs }: { logs: ReviewLog[] }) {
  const reduce = useReducedMotion();
  const [period, setPeriod] = useState<Period>(7);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const stats = useMemo(() => progressStats(logs, period), [logs, period]);
  const points = stats.points;

  const { yMax, step } = useMemo(
    () => niceScale(Math.max(1, ...points.map((p) => p.value))),
    [points],
  );

  const coords = points.map((p, i) => ({
    x: PAD_L + (points.length <= 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W),
    y: PAD_T + (1 - p.value / yMax) * PLOT_H,
  }));
  const baseY = PAD_T + PLOT_H;
  const lineD = smoothPath(coords);
  const last = coords.length - 1;
  const areaD = coords.length
    ? `${lineD} L ${coords[last].x.toFixed(1)} ${baseY} L ${coords[0].x.toFixed(1)} ${baseY} Z`
    : '';

  const gridVals: number[] = [];
  for (let v = 0; v <= yMax + 0.001; v += step) gridVals.push(Math.round(v));

  // Default the tooltip to the latest day; follow the hovered point otherwise.
  const activeIdx = hover == null ? last : Math.min(hover, last);
  const activePt = coords[activeIdx];
  const xEvery = points.length > 10 ? Math.ceil(points.length / 7) : 1;

  return (
    <div>
      {/* header + period selector */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="display" style={{ fontSize: 17, fontWeight: 600 }}>
          Seu progresso
        </h3>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-[var(--r-sm)] transition-colors hover:bg-[color:var(--surface-2)]"
            style={{ border: '1px solid var(--line-strong)', background: 'var(--surface-2)' }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            Últimos {period} dias
            <ChevronDown size={15} className="text-muted" />
          </button>
          {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="absolute right-0 z-50 mt-1 w-40 py-1"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: reduce ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  transformOrigin: 'top right',
                  background: 'var(--surface)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: 'var(--shadow-pop)',
                }}
              >
                {PERIODS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setPeriod(n);
                      setHover(null);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                    style={{ color: n === period ? 'var(--accent)' : 'var(--fg)' }}
                  >
                    Últimos {n} dias
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${VBW} ${VBH}`}
          width="100%"
          style={{ display: 'block', height: 'auto', overflow: 'visible' }}
          role="img"
          aria-label="Cards revisados por dia"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* gridlines + y labels */}
          {gridVals.map((v) => {
            const y = PAD_T + (1 - v / yMax) * PLOT_H;
            return (
              <g key={v}>
                <line x1={PAD_L} y1={y} x2={VBW - PAD_R} y2={y} stroke="var(--line)" strokeWidth={1} />
                <text x={PAD_L - 8} y={y + 3} fontFamily="var(--body)" fontSize={10} fill="var(--muted)" textAnchor="end">
                  {v}
                </text>
              </g>
            );
          })}

          {areaD && <path d={areaD} fill="url(#pc-fill)" stroke="none" />}
          {lineD && (
            <path d={lineD} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* x labels */}
          {points.map((p, i) =>
            i % xEvery === 0 || i === last ? (
              <text key={p.key} x={coords[i].x} y={VBH - 6} fontFamily="var(--body)" fontSize={10} fill="var(--muted)" textAnchor="middle">
                {p.label}
              </text>
            ) : null,
          )}

          {/* dots (with a wider invisible hit area for hover) */}
          {coords.map((c, i) => (
            <g key={points[i].key}>
              <circle cx={c.x} cy={c.y} r={12} fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setHover(i)} />
              <circle
                cx={c.x}
                cy={c.y}
                r={i === activeIdx ? 4 : 3}
                fill={i === activeIdx ? 'var(--accent)' : 'var(--surface)'}
                stroke="var(--accent)"
                strokeWidth={2}
                pointerEvents="none"
              />
            </g>
          ))}
        </svg>

        {/* floating value tooltip (kept on the active point) */}
        {activePt && (
          <div
            style={{
              position: 'absolute',
              left: `${(activePt.x / VBW) * 100}%`,
              top: `${(activePt.y / VBH) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 10px))',
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-pop)',
              padding: '5px 12px',
              textAlign: 'center',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <div className="display" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
              {points[activeIdx]?.value ?? 0}
            </div>
            <div className="text-muted" style={{ fontSize: 10 }}>cards</div>
          </div>
        )}
      </div>

    </div>
  );
}
