import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import type { CardStateCounts } from '../../lib/deckStats';

/** Anki-style legend order + colors (new=blue, learning=amber, relearning=red,
 *  young=light green, mature=green). */
const SEGMENTS: Array<{ key: keyof Omit<CardStateCounts, 'total'>; label: string; color: string }> = [
  { key: 'new', label: 'Novos', color: 'var(--accent-blue)' },
  { key: 'learning', label: 'Aprendendo', color: 'var(--accent-amber)' },
  { key: 'relearning', label: 'Reaprendendo', color: 'var(--accent)' },
  { key: 'young', label: 'Jovens', color: '#5fd38d' },
  { key: 'mature', label: 'Maduros', color: 'var(--accent-green)' },
];

const CX = 100;
const CY = 100;
const R = 92;

function polar(deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0 },
};

export function CardCountsPie({ counts }: { counts: CardStateCounts }) {
  const reduce = useReducedMotion();
  const total = counts.total;
  let acc = 0;
  const slices = SEGMENTS.map((s) => {
    const value = counts[s.key];
    const start = (acc / Math.max(1, total)) * 360;
    acc += value;
    const end = (acc / Math.max(1, total)) * 360;
    return { ...s, value, start, end };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      {/* Replays on every mount (i.e. each time the Stats tab is opened). */}
      <motion.svg
        viewBox="0 0 200 200"
        width="176"
        height="176"
        role="img"
        aria-label="Distribuição de cards por estado"
        style={{ flexShrink: 0, transformOrigin: 'center' }}
        initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -110 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 15 }}
      >
        {total === 0 ? (
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={2} />
        ) : (
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              // a single 100% slice can't be drawn as an arc — use a full circle
              if (s.end - s.start >= 359.999) {
                return <circle key={s.key} cx={CX} cy={CY} r={R} fill={s.color} />;
              }
              const [sx, sy] = polar(s.start);
              const [ex, ey] = polar(s.end);
              const large = s.end - s.start > 180 ? 1 : 0;
              const d = `M ${CX} ${CY} L ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`;
              return <path key={s.key} d={d} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />;
            })
        )}
      </motion.svg>

      <motion.div
        className="flex-1 w-full min-w-0"
        initial={reduce ? false : 'hidden'}
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } } }}
      >
        {SEGMENTS.map((s) => {
          const value = counts[s.key];
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <motion.div key={s.key} variants={rowVariants} className="flex items-center gap-3 py-1.5">
              <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span className="text-sm flex-1">{s.label}</span>
              <span className="mono text-sm" style={{ minWidth: 40, textAlign: 'right' }}>{value}</span>
              <span className="mono text-xs text-muted" style={{ minWidth: 44, textAlign: 'right' }}>{pct}%</span>
            </motion.div>
          );
        })}
        <motion.div variants={rowVariants} className="flex items-center gap-3 pt-2 mt-1" style={{ borderTop: '1px solid var(--line)' }}>
          <span style={{ width: 12, height: 12, flexShrink: 0 }} />
          <span className="text-sm flex-1 text-muted">Total</span>
          <span className="mono text-sm" style={{ minWidth: 40, textAlign: 'right', fontWeight: 600 }}>{total}</span>
          <span style={{ minWidth: 44 }} />
        </motion.div>
      </motion.div>
    </div>
  );
}
