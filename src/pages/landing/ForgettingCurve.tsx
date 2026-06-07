import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Reveal } from './anim';

const DRAW_DUR = 4.2;

/* ---------------------------------------------------------- chart geometry */
const X0 = 70;
const X1 = 888;
const Y100 = 66;
const Y0 = 370;
const H = Y0 - Y100;
const yFor = (pct: number) => Y100 + ((100 - pct) / 100) * H;

const REVIEWS = [205, 363, 521, 679, 837];
const TROUGHS = [73, 75, 77, 79, 81];
const GRID = [100, 75, 50, 25, 0];

/** "Com o Kioku" sawtooth: decay to a trough, jump back to 100% at each review. */
function buildKioku(): string {
  let d = `M ${X0} ${Y100}`;
  let px = X0;
  let py = Y100;
  REVIEWS.forEach((rx, i) => {
    const ty = yFor(TROUGHS[i]);
    const c1x = px + (rx - px) * 0.42;
    const c1y = py + (ty - py) * 0.72;
    const c2x = rx - (rx - px) * 0.14;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${ty.toFixed(1)} ${rx} ${ty.toFixed(1)}`;
    d += ` L ${rx} ${Y100}`;
    px = rx;
    py = Y100;
  });
  const ty = yFor(82);
  d += ` C ${(px + (X1 - px) * 0.42).toFixed(1)} ${(py + (ty - py) * 0.72).toFixed(1)} ${(X1 - (X1 - px) * 0.14).toFixed(1)} ${ty.toFixed(1)} ${X1} ${ty.toFixed(1)}`;
  return d;
}
const KIOKU = buildKioku();
const KIOKU_FILL = `${KIOKU} L ${X1} ${Y0} L ${X0} ${Y0} Z`;
const GRAY = `M ${X0} ${Y100} C 150 185 220 266 310 300 C 470 346 660 358 ${X1} 361`;
const GRAY_FILL = `${GRAY} L ${X1} ${Y0} L ${X0} ${Y0} Z`;

/* -------------------------------------------------------------- the chart -- */
function Chart() {
  const [showKioku, setShowKioku] = useState(true);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const anim = !reduce && inView; // play the draw-in animation
  const reviewDelay = (rx: number) => 0.25 + ((rx - X0) / (X1 - X0)) * (DRAW_DUR - 0.5);

  const tabStyle = (active: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 13px',
    borderRadius: 'var(--r-full)',
    border: `1px solid ${active ? 'var(--line-strong)' : 'transparent'}`,
    background: active ? 'var(--surface-2)' : 'transparent',
    color: active ? 'var(--fg)' : 'var(--muted)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'var(--body)',
    cursor: 'pointer',
    transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
  });

  return (
    <div ref={ref}>
      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button type="button" onClick={() => setShowKioku(false)} style={tabStyle(!showKioku)} aria-pressed={!showKioku}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: 'var(--muted)' }} />
          Sem revisão
        </button>
        <button type="button" onClick={() => setShowKioku(true)} style={tabStyle(showKioku)} aria-pressed={showKioku}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: 'var(--accent)' }} />
          Com o Kioku
        </button>
      </div>

      <svg viewBox="0 0 920 440" width="100%" style={{ display: 'block', height: 'auto' }} role="img" aria-label="Curva de retenção ao longo do tempo, com e sem revisão.">
        <defs>
          <linearGradient id="fc-kioku" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="fc-gray" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + y labels */}
        {GRID.map((pct) => {
          const y = yFor(pct);
          return (
            <g key={pct}>
              <line x1={X0} y1={y} x2={X1} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} strokeDasharray="4 5" />
              <text x={X0 - 14} y={y + 4} fontFamily="var(--body)" fontSize={13} fill="var(--muted)" textAnchor="end">{pct}%</text>
            </g>
          );
        })}

        {/* gray (no review) — always shown */}
        <motion.path
          d={GRAY_FILL}
          fill="url(#fc-gray)"
          stroke="none"
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: reduce || inView ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 1.6 }}
        />

        {/* kioku (with review) — draws in progressively */}
        {showKioku && (reduce || inView) && (
          <>
            <motion.path
              d={KIOKU_FILL}
              fill="url(#fc-kioku)"
              stroke="none"
              initial={anim ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={anim ? { duration: DRAW_DUR, ease: 'easeInOut' } : { duration: 0 }}
            />
            {REVIEWS.map((rx, i) => (
              <motion.line
                key={`v${i}`}
                x1={rx}
                y1={44}
                x2={rx}
                y2={Y0}
                stroke="var(--accent)"
                strokeOpacity={0.35}
                strokeWidth={1}
                strokeDasharray="4 5"
                initial={anim ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={anim ? { delay: reviewDelay(rx), duration: 0.4 } : { duration: 0 }}
              />
            ))}
            <motion.path
              d={KIOKU}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={anim ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={anim ? { duration: DRAW_DUR, ease: 'linear' } : { duration: 0 }}
            />
          </>
        )}

        {/* gray curve on top of fills */}
        <motion.path
          d={GRAY}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={3}
          strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: reduce || inView ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 1.6, ease: 'easeOut' }}
        />

        {/* review dots + pills — appear one at a time as the curve reaches them */}
        {showKioku && (reduce || inView) &&
          REVIEWS.map((rx, i) => (
            <motion.g
              key={`r${i}`}
              initial={anim ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={anim ? { delay: reviewDelay(rx), duration: 0.35 } : { duration: 0 }}
            >
              <circle cx={rx} cy={Y100} r={6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
              <rect x={rx - 39} y={13} width={78} height={27} rx={13.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.5} />
              <text x={rx} y={31} fontFamily="var(--body)" fontSize={12} fontWeight={600} fill="var(--fg)" textAnchor="middle">
                Revisão {i + 1}
              </text>
            </motion.g>
          ))}

        {/* x-axis + arrow */}
        <line x1={X0} y1={Y0} x2={X1 + 14} y2={Y0} stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" />
        <path d={`M ${X1 + 14} ${Y0} l -9 -5 m 9 5 l -9 5`} stroke="var(--muted)" strokeWidth={2} fill="none" strokeLinecap="round" />

        {/* axis labels */}
        <text x={X0} y={52} fontFamily="var(--body)" fontSize={14} fill="var(--muted)">Retenção (%)</text>
        <text x={X0} y={Y0 + 26} fontFamily="var(--body)" fontSize={14} fill="var(--muted)">Hoje</text>
        <text x={X1} y={Y0 + 26} fontFamily="var(--body)" fontSize={14} fill="var(--muted)" textAnchor="end">Dias depois</text>
      </svg>

      <p
        style={{
          textAlign: 'center',
          color: 'var(--muted)',
          fontSize: 11,
          letterSpacing: 0.3,
          opacity: 0.7,
          marginTop: 14,
          fontFamily: 'var(--body)',
        }}
      >
        Curva do Esquecimento - Hermann Ebbinghaus
      </p>
    </div>
  );
}

export function ForgettingCurve() {
  return (
    <section className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28">
      <Reveal>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="display" style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 600 }}>
            Por que você esquece
          </h2>
          <p className="text-muted mt-4" style={{ lineHeight: 1.65 }}>
            Sem revisar, a retenção despenca em poucos dias.
          </p>
          <p className="text-muted mt-3" style={{ lineHeight: 1.65 }}>
            Cada revisão achata a curva do esquecimento, e o que você aprendeu vira memória de longo prazo.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="surface mt-10 p-5 md:p-8" style={{ borderRadius: 'var(--r-lg)' }}>
          <Chart />
        </div>
      </Reveal>
    </section>
  );
}
