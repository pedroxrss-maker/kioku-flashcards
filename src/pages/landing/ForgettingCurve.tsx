import { motion, useReducedMotion } from 'framer-motion';
import { EASE, Reveal } from './anim';

const DECAY = 'M 8,28 C 70,96 120,162 205,184 C 305,210 410,216 512,219';
const KIOKU = 'M 8,28 L 82,52 L 96,28 L 188,52 L 204,28 L 300,52 L 320,32 L 432,54 L 452,34 L 512,46';
const REVIEW_DOTS: Array<[number, number]> = [
  [96, 28],
  [204, 28],
  [320, 32],
  [452, 34],
];

function Chart() {
  const reduce = useReducedMotion();
  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 mb-4">
        <span className="inline-flex items-center gap-2 text-xs text-muted">
          <span style={{ width: 18, height: 3, borderRadius: 2, background: 'var(--muted)', opacity: 0.6 }} />
          Sem revisão
        </span>
        <span className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          <span style={{ width: 18, height: 3, borderRadius: 2, background: 'var(--accent)' }} />
          Com o Kioku
        </span>
      </div>

      <svg viewBox="0 0 520 240" width="100%" style={{ display: 'block', height: 'auto' }} role="img" aria-label="Curva do esquecimento: sem revisão cai rápido; com o Kioku permanece alta.">
        {/* baseline + axis hints */}
        <line x1={8} y1={219} x2={512} y2={219} stroke="var(--line-strong)" strokeWidth={1} />
        <text x={8} y={236} fontFamily="var(--body)" fontSize={11} fill="var(--muted)">Hoje</text>
        <text x={512} y={236} fontFamily="var(--body)" fontSize={11} fill="var(--muted)" textAnchor="end">Dias depois</text>
        <text x={8} y={16} fontFamily="var(--body)" fontSize={11} fill="var(--muted)">Retenção</text>

        {/* Sem revisão (muted, steep) */}
        {reduce ? (
          <path d={DECAY} fill="none" stroke="var(--muted)" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
        ) : (
          <motion.path
            d={DECAY}
            fill="none"
            stroke="var(--muted)"
            strokeOpacity={0.55}
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.5, ease: EASE }}
          />
        )}

        {/* Com o Kioku (accent, flattened with review upticks) */}
        {reduce ? (
          <path d={KIOKU} fill="none" stroke="var(--accent)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <motion.path
            d={KIOKU}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.7, ease: EASE, delay: 0.35 }}
          />
        )}

        {/* review markers */}
        {REVIEW_DOTS.map(([x, y], i) =>
          reduce ? (
            <circle key={i} cx={x} cy={y} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          ) : (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r={4}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
              initial={{ opacity: 0, scale: 0 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.3, ease: EASE, delay: 1.1 + i * 0.18 }}
            />
          ),
        )}
      </svg>
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
            Sem revisar, a retenção despenca em poucos dias: é a curva do esquecimento de Ebbinghaus.
            Com repetição espaçada no momento certo, cada revisão achata essa curva e o que você
            aprendeu vira memória de longo prazo.
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
