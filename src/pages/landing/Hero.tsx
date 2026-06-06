import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { Brain, FlaskConical, Flame, RefreshCw, TrendingUp, Volume2 } from 'lucide-react';
import { EASE, Reveal, scrollToId, useCountUp } from './anim';
import { NeuroWordmark } from './brand';

const VALUES = [
  { icon: Brain, title: 'SM-2 e FSRS', line: 'dois algoritmos de repetição espaçada' },
  { icon: RefreshCw, title: 'Sincroniza', line: 'seu progresso em qualquer dispositivo' },
  { icon: FlaskConical, title: 'Base científica', line: 'curva de Ebbinghaus aplicada' },
];

const ANSWERS = [
  { label: 'Errei', int: '1 min', color: 'var(--accent)', text: '#ffffff' },
  { label: 'Difícil', int: '10 min', color: 'var(--accent-amber)', text: '#0a0a0a' },
  { label: 'Bom', int: '1 d', color: 'var(--fg)', text: '#0a0a0a' },
  { label: 'Fácil', int: '4 d', color: 'var(--accent-green)', text: '#0a0a0a' },
];

/* ----------------------------------------------------- flip flashcard ----- */
function FlipCard() {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setFlipped(true), 1900);
    return () => clearTimeout(t);
  }, [reduce]);

  const face: CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    background: '#fbfbfa',
    color: '#15151a',
    borderRadius: 'var(--r-lg)',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: 'var(--shadow-pop)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 22px',
  };

  return (
    <div style={{ perspective: 1400 }}>
      <motion.div
        style={{ position: 'relative', width: '100%', height: 232, transformStyle: 'preserve-3d', cursor: 'pointer' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.7, ease: EASE }}
        onTap={() => setFlipped((f) => !f)}
        onHoverStart={() => setFlipped(true)}
        onHoverEnd={() => setFlipped(false)}
      >
        {/* Front */}
        <div style={face}>
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: 'var(--body)', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', color: '#9a9a96' }}>
              FRENTE
            </span>
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{ width: 30, height: 30, background: 'rgba(255,59,31,0.12)', color: 'var(--accent)' }}
            >
              <Volume2 size={15} />
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="display" style={{ fontSize: 30, fontWeight: 600 }}>ubiquitous</span>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#b3b3ad' }}>toque para virar</p>
        </div>

        {/* Back */}
        <div style={{ ...face, transform: 'rotateY(180deg)' }}>
          <span style={{ fontFamily: 'var(--body)', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', color: '#9a9a96' }}>
            VERSO
          </span>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
            <span className="display" style={{ fontSize: 21, fontWeight: 600 }}>
              onipresente, que está em toda parte.
            </span>
            <span style={{ fontSize: 13, fontStyle: 'italic', color: '#7a7a74' }}>
              Smartphones are now ubiquitous.
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* --------------------------------------------------- floating widgets ----- */
function Float({ children, dur = 4.5, delay = 0 }: { children: ReactNode; dur?: number; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      animate={{ y: [0, -9, 0] }}
      transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {children}
    </motion.div>
  );
}

function Parallax({
  y,
  className,
  style,
  children,
}: {
  y: MotionValue<number>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} style={reduce ? style : { ...style, y }}>
      {children}
    </motion.div>
  );
}

function RingCard() {
  const reduce = useReducedMotion();
  const pct = 78;
  const r = 26;
  const c = 2 * Math.PI * r;
  const { ref, value } = useCountUp(pct);
  const offset = c * (1 - pct / 100);

  return (
    <div
      className="surface"
      style={{ padding: 12, borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-card)' }}
    >
      <div ref={ref} style={{ width: 60, height: 60 }}>
        <svg width={60} height={60} viewBox="0 0 64 64">
          <circle cx={32} cy={32} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={7} />
          {reduce ? (
            <circle
              cx={32}
              cy={32}
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              transform="rotate(-90 32 32)"
            />
          ) : (
            <motion.circle
              cx={32}
              cy={32}
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              whileInView={{ strokeDashoffset: offset }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.4, ease: EASE }}
              transform="rotate(-90 32 32)"
            />
          )}
          <text x="32" y="32" textAnchor="middle" dominantBaseline="central" fontFamily="var(--display)" fontWeight={700} fontSize="14" fill="var(--fg)">
            {value}%
          </text>
        </svg>
      </div>
      <div>
        <p className="text-xs" style={{ fontWeight: 700 }}>Retenção</p>
        <p className="text-[11px] text-muted">neste deck</p>
      </div>
    </div>
  );
}

function SparkCard() {
  const reduce = useReducedMotion();
  const d = 'M2,26 L16,22 L30,24 L44,15 L58,18 L72,9 L86,12 L102,4';
  return (
    <div className="surface" style={{ padding: 12, borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <TrendingUp size={14} style={{ color: 'var(--accent-green)' }} />
        <span className="text-xs" style={{ fontWeight: 700 }}>Evolução</span>
        <span className="text-xs" style={{ color: 'var(--accent-green)', fontWeight: 700 }}>+32%</span>
      </div>
      <svg width={104} height={30} viewBox="0 0 104 30">
        {reduce ? (
          <path d={d} fill="none" stroke="var(--accent-green)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <motion.path
            d={d}
            fill="none"
            stroke="var(--accent-green)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.2, ease: EASE }}
          />
        )}
      </svg>
    </div>
  );
}

/* ================================================================ Hero ==== */
export function Hero() {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const yStreak = useTransform(scrollYProgress, [0, 1], [0, -52]);
  const yRing = useTransform(scrollYProgress, [0, 1], [0, 46]);
  const ySpark = useTransform(scrollYProgress, [0, 1], [0, -30]);

  return (
    <section ref={heroRef} id="topo" className="relative">
      <div className="mx-auto max-w-[1180px] px-5 md:px-8 pt-12 md:pt-16 pb-16 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        {/* LEFT */}
        <div>
          <Reveal>
            <span className="pill pill-muted" style={{ padding: '6px 12px', fontSize: 12, gap: 7 }}>
              Powered by <NeuroWordmark size={12} />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="display mt-5" style={{ fontSize: 'clamp(34px, 6vw, 58px)', fontWeight: 600, lineHeight: 1.04 }}>
              A cura para o esquecimento<span style={{ color: 'var(--accent)' }}>.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="text-muted mt-5" style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', maxWidth: 540, lineHeight: 1.6 }}>
              O Kioku usa recordação ativa e repetição espaçada para colocar cada card na sua frente no
              momento exato em que você ia esquecer. Assistir vídeo e reler resumo não fixa nada; isso é
              consumo passivo. Aqui o estudo vira memória de longo prazo.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="flex flex-wrap items-center gap-3 mt-7">
              <button type="button" className="btn-mega" onClick={() => nav('/entrar?mode=signup')}>
                Criar conta grátis
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => scrollToId('como-funciona', reduce)}>
                Ver como funciona
              </button>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="grid sm:grid-cols-3 gap-4 mt-9">
              {VALUES.map(({ icon: Icon, title, line }) => (
                <div key={title} className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center justify-center rounded-[var(--r-sm)]" style={{ width: 34, height: 34, background: 'var(--surface-2)', color: 'var(--accent)' }}>
                    <Icon size={17} />
                  </span>
                  <p className="text-sm" style={{ fontWeight: 700 }}>{title}</p>
                  <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>{line}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* RIGHT: animated product preview */}
        <Reveal delay={0.1} y={30}>
          <div className="relative mx-auto" style={{ width: '100%', maxWidth: 380, paddingTop: 8 }}>
            <FlipCard />

            {/* Answer buttons: mirror the real review screen */}
            <div className="flex gap-2 mt-3">
              {ANSWERS.map((a, i) => (
                <div
                  key={a.label}
                  className="answer-btn"
                  style={{ '--btn-color': a.color, '--btn-text': a.text, minHeight: 64, cursor: 'default' } as CSSProperties}
                >
                  <span className="answer-key">{i + 1}</span>
                  <span className="answer-label">{a.label}</span>
                  <span className="answer-int">{a.int}</span>
                </div>
              ))}
            </div>

            {/* Floating cards */}
            <Parallax y={yStreak} className="absolute" style={{ top: -10, left: 0, zIndex: 10 }}>
              <Float dur={4.8}>
                <div
                  className="surface"
                  style={{ padding: '8px 12px', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 9, boxShadow: 'var(--shadow-card)' }}
                >
                  <span className="inline-flex items-center justify-center rounded-[var(--r-sm)]" style={{ width: 32, height: 32, background: 'rgba(255,59,31,0.16)', color: 'var(--accent)' }}>
                    <Flame size={17} />
                  </span>
                  <div>
                    <p className="text-sm" style={{ fontWeight: 700, lineHeight: 1.1 }}>12 dias</p>
                    <p className="text-[11px] text-muted">de sequência</p>
                  </div>
                </div>
              </Float>
            </Parallax>

            <Parallax y={yRing} className="absolute" style={{ bottom: 84, right: 0, zIndex: 10 }}>
              <Float dur={5.6} delay={0.4}>
                <RingCard />
              </Float>
            </Parallax>

            <Parallax y={ySpark} className="absolute" style={{ bottom: -14, left: 10, zIndex: 10 }}>
              <Float dur={5.1} delay={0.8}>
                <SparkCard />
              </Float>
            </Parallax>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
