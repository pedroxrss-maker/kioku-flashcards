/**
 * Hero product mockup: a dark, floating, interactive "app screenshot" mirroring
 * the real review screen. A tilted main flashcard with a stacked-deck shadow,
 * three satellite cards (streak / progress / evolution) spread to the right, and
 * the four self-rating buttons below. Everything bobs gently (out of sync) and
 * shifts slightly on scroll. Absolute layout inside a responsive scaler so the
 * exact composition (tilt, offsets, layering) holds at any width.
 *
 * Animations always play: Kioku forces them on, ignoring prefers-reduced-motion.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import type { MotionValue } from 'framer-motion';
import { ArrowRight, Flame, MoreVertical, Star } from 'lucide-react';
import { makeSm2Scheduler } from '../../features/scheduling/sm2-adapter';
import type { Card, Rating } from '../../db/types';
import { useCountUp } from './anim';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const HAIRLINE = '1px solid rgba(255,255,255,0.08)';
const SOFT_SHADOW = '0 20px 40px rgba(0,0,0,0.45)';

// Shared resting 3D tilt — used by the main card AND the satellite cards so they
// all lean at the same angle.
const TILT_PERSPECTIVE = 700;
const TILT_TRANSFORM = 'rotateX(18deg) rotateY(-22deg) rotateZ(-2deg)';

const satCard: CSSProperties = {
  background: 'var(--surface-2)',
  border: HAIRLINE,
  borderRadius: 16,
  boxShadow: SOFT_SHADOW,
};

const pill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '5px 12px',
  borderRadius: 999,
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'var(--body)',
};

const ANSWERS: Array<{ rating: Rating; color: string; text: string }> = [
  { rating: 'again', color: 'var(--accent)', text: '#ffffff' },
  { rating: 'hard', color: 'var(--accent-amber)', text: '#1a1205' },
  { rating: 'good', color: 'var(--accent-green)', text: '#04130c' },
  { rating: 'easy', color: 'var(--accent-blue)', text: '#ffffff' },
];

/* ----------------------------------------- live SM-2 demo (deck + ratings) */
interface DemoMeta {
  q: string; // front question
  a: string; // back answer (text)
  img: string; // back illustration
  bg: string; // back bg color, matched to the image so it blends
}
const DECK: DemoMeta[] = [
  { q: 'Qual é a principal função das mitocôndrias na célula?', a: 'Produzir energia (ATP) para a célula.', img: '/mitochondria-atp.png', bg: '#16171B' },
  { q: 'O que vence a curva do esquecimento?', a: 'Repetição espaçada, no momento certo.', img: '/card2.png', bg: '#121215' },
  { q: 'O que supera maratonas de estudo?', a: 'Consistência: pouco, todo dia.', img: '/card3.png', bg: '#121215' },
];

function newDemoCard(): Card {
  const t = Date.now();
  return {
    id: Math.random().toString(36).slice(2),
    deckId: 'demo',
    front: '',
    back: '',
    state: 'new',
    due: t,
    sm2: { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, step: 0, isLeech: false },
    fsrs: { stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null },
    createdAt: t,
    updatedAt: t,
  };
}

interface DemoState {
  meta: DemoMeta;
  index: number;
  flipped: boolean;
  /** True once the user has flipped the card at least once (hides the hint). */
  touched: boolean;
  flip: () => void;
  preview: Record<Rating, { card: Card; intervalLabel: string }>;
  rate: (r: Rating) => void;
}
const DemoCtx = createContext<DemoState | null>(null);
const useDemo = () => useContext(DemoCtx) as DemoState;

/** Drives the hero deck through the REAL SM-2 adapter: each button previews the
 *  interval SM-2 would schedule, and rating commits it and advances the deck. */
function useSm2Demo(): DemoState {
  const scheduler = useMemo(() => makeSm2Scheduler(), []);
  const [cards, setCards] = useState<Card[]>(() => DECK.map(newDemoCard));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [touched, setTouched] = useState(false);

  const current = cards[index];
  const preview = useMemo(() => scheduler.preview(current, Date.now()), [scheduler, current]);

  const rate = (r: Rating) => {
    if (!flipped) return;
    const { card } = scheduler.apply(current, r, Date.now(), 0);
    setCards((cs) => cs.map((c, i) => (i === index ? card : c)));
    setIndex((i) => (i + 1) % DECK.length);
    setFlipped(false);
  };

  return {
    meta: DECK[index],
    index,
    flipped,
    touched,
    flip: () => {
      setTouched(true);
      setFlipped((f) => !f);
    },
    preview,
    rate,
  };
}

/* ----------------------------------------------- responsive scaler -------- */
function Scaler({ designWidth, designHeight, maxWidth, children }: { designWidth: number; designHeight: number; maxWidth: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fit the design box to the container; may scale UP past 1 (the outer
    // maxWidth caps how large the mockup can get).
    const update = () => setScale(el.clientWidth / designWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div ref={ref} style={{ width: '100%', maxWidth, height: designHeight * scale, marginInline: 'auto', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: designWidth, height: designHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------- float primitives --------- */
function Bob({ children, dur, delay, disabled }: { children: ReactNode; dur: number; delay: number; disabled: boolean }) {
  if (disabled) return <>{children}</>;
  return (
    <motion.div animate={{ y: [0, -9, 0] }} transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut', delay }}>
      {children}
    </motion.div>
  );
}

interface FloatItemProps {
  left: number;
  top: number;
  width: number;
  zIndex?: number;
  rotate?: number;
  dur: number;
  delay: number;
  parallax: MotionValue<number>;
  children: ReactNode;
}
function FloatItem({ left, top, width, zIndex = 1, rotate = 0, dur, delay, parallax, children }: FloatItemProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div style={{ position: 'absolute', left, top, width, zIndex, ...(reduce ? {} : { y: parallax }) }}>
      <Bob dur={dur} delay={delay} disabled={!!reduce}>
        <div style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}>{children}</div>
      </Bob>
    </motion.div>
  );
}

/**
 * Makes a floating element draggable, tethered to within `pct` of its size from
 * its resting spot (elastic past that), and springing back on release. The drag
 * transform composes with the parent bob/parallax, so they don't fight.
 */
function Draggable({ width, pct = 0.1, children }: { width: number; pct?: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  const r = width * pct;
  return (
    <motion.div
      drag
      dragConstraints={{ left: -r, right: r, top: -r, bottom: r }}
      dragElastic={0.18}
      dragSnapToOrigin
      whileDrag={{ scale: 1.04 }}
      style={{ cursor: 'grab', touchAction: 'none' }}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------- main flashcard (deck) ---- */
function CardBack({ meta }: { meta: DemoMeta }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {imgOk ? (
        <img
          src={meta.img}
          alt=""
          onError={() => setImgOk(false)}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.4, fontFamily: 'var(--body)', textAlign: 'center' }}>{meta.a}</p>
      )}
    </div>
  );
}

const FACE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
  background: 'var(--surface)',
  border: HAIRLINE,
  borderRadius: 20,
  boxShadow: '0 28px 54px rgba(0,0,0,0.55)',
  padding: '22px 22px 18px',
  display: 'flex',
  flexDirection: 'column',
};
const SIL: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--surface)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 20,
  boxShadow: '0 18px 36px rgba(0,0,0,0.42)',
};

function MainCard() {
  const reduce = useReducedMotion();
  const { meta, index, flipped, flip } = useDemo();
  const W = 300;
  const H = 252;

  return (
    <div
      style={{ position: 'relative', width: W, height: H, perspective: TILT_PERSPECTIVE, cursor: 'pointer' }}
      onClick={flip}
    >
      {/* Shared 3D frame: tilt lives HERE; the float (translateY) lives on an
          ancestor (Bob/FloatItem), so the two compose. */}
      <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: TILT_TRANSFORM }}>
        {/* the two upcoming flashcards in the queue, peeking behind the current one */}
        {[2, 1].map((off) => {
          const m = DECK[(index + off) % DECK.length];
          const t = off === 2 ? { x: 38, y: 40, z: -82, rot: 3, op: 0.45 } : { x: 18, y: 22, z: -52, rot: 1.5, op: 0.72 };
          return (
            <div
              key={off}
              style={{ ...SIL, opacity: t.op, padding: '20px', overflow: 'hidden', transform: `translate(${t.x}px, ${t.y}px) translateZ(${t.z}px) rotate(${t.rot}deg)` }}
            >
              <span style={pill}>Frente</span>
              <p style={{ color: 'var(--muted)', fontSize: 14.5, fontWeight: 600, lineHeight: 1.35, fontFamily: 'var(--body)', marginTop: 14 }}>{m.q}</p>
            </div>
          );
        })}

        {/* current card: flips on click; slides out / next slides in on advance */}
        <AnimatePresence>
          <motion.div
            key={index}
            style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}
            initial={reduce ? false : { opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -52, scale: 0.94 }}
            transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
          >
            <motion.div
              style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', pointerEvents: 'none' }}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }}
            >
              {/* FRONT */}
              <div style={FACE}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={pill}>Frente</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <Star size={17} color="var(--accent-amber)" fill="var(--accent-amber)" />
                    <MoreVertical size={17} color="var(--muted)" />
                  </span>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <p style={{ color: 'var(--fg)', fontSize: 19, fontWeight: 600, lineHeight: 1.35, fontFamily: 'var(--body)' }}>{meta.q}</p>
                </div>
                <motion.span
                  style={{
                    display: 'inline-flex',
                    alignSelf: 'flex-start',
                    alignItems: 'center',
                    gap: 7,
                    color: 'var(--accent)',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'var(--body)',
                    padding: '7px 13px',
                    borderRadius: 'var(--r-full)',
                    border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
                    background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  }}
                  animate={
                    reduce
                      ? undefined
                      : {
                          scale: [1, 1.04, 1],
                          boxShadow: [
                            '0 0 0 0 rgba(255,59,31,0.5)',
                            '0 0 0 8px rgba(255,59,31,0)',
                            '0 0 0 0 rgba(255,59,31,0)',
                          ],
                        }
                  }
                  transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <ArrowRight size={15} /> Clique para ver a resposta
                </motion.span>
              </div>

              {/* BACK — answer text above the illustration; bg matches the image */}
              <div style={{ ...FACE, background: meta.bg, transform: 'rotateY(180deg)', padding: '16px 16px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={pill}>Verso</span>
                  <Star size={17} color="var(--accent-amber)" fill="var(--accent-amber)" />
                </div>
                <span style={{ color: 'var(--fg)', fontSize: 15, fontWeight: 600, fontFamily: 'var(--body)', textAlign: 'center', marginBottom: 4 }}>{meta.a}</span>
                <CardBack meta={meta} />
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------------------------------- answer buttons ----------- */
/** Real SM-2 entry point: each chip shows the interval SM-2 would schedule for
 *  that rating (once the answer is revealed); tapping it commits via the adapter
 *  and advances the deck. Still individually draggable (springs back). */
function AnswerButtons() {
  const reduce = useReducedMotion();
  const { preview, rate, flipped } = useDemo();
  const active = flipped;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      {ANSWERS.map((a) => {
        const chip = (
          <Tilt3D fill>
            <div
              className="answer-chip"
              style={{ '--bc': a.color, '--tc': a.text, height: '100%', opacity: active ? 1 : 0.4 } as CSSProperties}
              onClick={() => rate(a.rating)}
            >
              <span className="chip-sub" style={{ display: 'block', fontSize: 9.5, lineHeight: 1.2 }}>
                {active ? preview[a.rating].intervalLabel : '·'}
              </span>
              <span className="chip-rating" style={{ display: 'block', fontSize: 11, fontWeight: 800, marginTop: 2 }}>{a.rating}</span>
            </div>
          </Tilt3D>
        );
        if (reduce) return <div key={a.rating}>{chip}</div>;
        // Draggable on its own up to ~5% of the button row, then springs back to
        // its EXACT original position on release — so the order never changes.
        const lim = 300 * 0.05;
        return (
          <motion.div
            key={a.rating}
            drag
            dragConstraints={{ left: -lim, right: lim, top: -lim, bottom: lim }}
            dragElastic={0.12}
            dragMomentum={false}
            dragSnapToOrigin
            whileDrag={{ scale: 1.06, zIndex: 30 }}
            style={{ touchAction: 'none' }}
          >
            {chip}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------- satellite cards ---------- */
/** Leans its content at the same 3D angle as the main flashcard. The float
 *  (translateY) lives on the ancestor FloatItem, so it composes with this tilt. */
function Tilt3D({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  const h = fill ? '100%' : undefined;
  return (
    <div style={{ perspective: TILT_PERSPECTIVE, height: h }}>
      <div style={{ transform: TILT_TRANSFORM, transformStyle: 'preserve-3d', height: h }}>{children}</div>
    </div>
  );
}

function StreakCard() {
  return (
    <div style={{ ...satCard, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <Flame size={21} color="var(--accent-amber)" fill="var(--accent-amber)" className="flame-anim" />
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--display)', lineHeight: 1 }}>12</span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6, fontFamily: 'var(--body)' }}>dia(s) de sequência</p>
    </div>
  );
}

function ProgressCard() {
  const reduce = useReducedMotion();
  const pct = 78;
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const { ref, value } = useCountUp(pct);

  return (
    <div style={{ ...satCard, padding: '15px 18px' }}>
      <p style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginBottom: 8, fontFamily: 'var(--body)' }}>Seu progresso</p>
      <div ref={ref} style={{ position: 'relative', width: 84, height: 84, margin: '0 auto' }}>
        <svg width={84} height={84} viewBox="0 0 84 84">
          <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={9} />
          {reduce ? (
            <circle cx={42} cy={42} r={r} fill="none" stroke="var(--accent)" strokeWidth={9} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 42 42)" />
          ) : (
            <motion.circle
              cx={42}
              cy={42}
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              whileInView={{ strokeDashoffset: offset }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.4, ease: EASE }}
              transform="rotate(-90 42 42)"
            />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--display)', lineHeight: 1 }}>{value}%</span>
          <span style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--body)' }}>concluído</span>
        </div>
      </div>
    </div>
  );
}

function EvolucaoCard() {
  const reduce = useReducedMotion();
  const d = 'M3,31 L18,27 L33,29 L48,18 L63,21 L78,11 L95,4';
  return (
    <div style={{ ...satCard, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--body)' }}>Evolução</span>
        <span style={{ color: 'var(--accent-green)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--display)' }}>+32%</span>
      </div>
      <svg width="98" height="34" viewBox="0 0 98 34">
        {reduce ? (
          <path d={d} fill="none" stroke="var(--accent-green)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <motion.path
            d={d}
            fill="none"
            stroke="var(--accent-green)"
            strokeWidth={2.6}
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

/* ================================================================ mockup == */
export function HeroMockup() {
  const { scrollY } = useScroll();
  // Subtle, varied parallax so layers shift at different rates on scroll.
  const pMain = useTransform(scrollY, [0, 700], [0, -16]);
  const pStreak = useTransform(scrollY, [0, 700], [0, -46]);
  const pProg = useTransform(scrollY, [0, 700], [0, 30]);
  const pEvo = useTransform(scrollY, [0, 700], [0, -36]);
  const demo = useSm2Demo();
  const reduce = useReducedMotion();

  return (
    <DemoCtx.Provider value={demo}>
    <Scaler designWidth={520} designHeight={460} maxWidth={680}>
      {/* MAIN card (3D-tilted) + its answer buttons — draggable within 5% of size */}
      <FloatItem left={6} top={66} width={300} dur={6} delay={0} parallax={pMain} zIndex={3}>
        <Draggable width={300} pct={0.05}>
          <MainCard />
        </Draggable>
      </FloatItem>
      <FloatItem left={30} top={352} width={300} dur={6} delay={0} parallax={pMain} zIndex={4}>
        <AnswerButtons />
      </FloatItem>

      {/* three satellites to the right, vertically spread, each floating + draggable */}
      <FloatItem left={352} top={32} width={158} dur={5.2} delay={0.4} parallax={pStreak} zIndex={6}>
        <Draggable width={158}>
          <Tilt3D>
            <StreakCard />
          </Tilt3D>
        </Draggable>
      </FloatItem>
      <FloatItem left={344} top={150} width={162} dur={6.2} delay={0.8} parallax={pProg} zIndex={6}>
        <Draggable width={162}>
          <Tilt3D>
            <ProgressCard />
          </Tilt3D>
        </Draggable>
      </FloatItem>
      <FloatItem left={352} top={330} width={158} dur={5.6} delay={1.2} parallax={pEvo} zIndex={6}>
        <Draggable width={158}>
          <Tilt3D>
            <EvolucaoCard />
          </Tilt3D>
        </Draggable>
      </FloatItem>

      {/* Click-hand cursor: rises from "Evolução" up to the card's CTA, taps,
          then loops — a gentle hint to click the demo. Vanishes once the user
          flips the card the first time. Decorative + off under reduced motion.
          Coords are in the 520x460 design box. */}
      {!reduce && !demo.touched && (
        <motion.div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            zIndex: 20,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 3px 7px rgba(0,0,0,0.55))',
          }}
          animate={{
            x: [420, 420, 116, 116, 116, 116, 116, 420],
            y: [372, 372, 280, 280, 280, 280, 280, 372],
            opacity: [0, 1, 1, 1, 1, 1, 0, 0],
            scale: [1, 1, 1, 0.82, 1, 1, 1, 1],
          }}
          transition={{
            duration: 4,
            times: [0, 0.1, 0.42, 0.5, 0.57, 0.74, 0.82, 1],
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <ClickHand size={30} />
        </motion.div>
      )}
    </Scaler>
    </DemoCtx.Provider>
  );
}

/** Cursor de mao "apontando" (estilo do icone anexo): indice estendido, mais
 *  tres dedos dobrados, polegar a esquerda e o punho. Preenchimento branco
 *  solido com pequenas folgas entre os dedos (os vaos = a separacao dos dedos),
 *  para aparecer sobre o mockup escuro. */
function ClickHand({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 34) / 30}
      viewBox="0 0 30 34"
      fill="#fff"
      aria-hidden="true"
      focusable="false"
    >
      {/* punho / palma */}
      <rect x="7.4" y="12.5" width="18.6" height="18.5" rx="5.5" />
      {/* polegar (inclinado, a esquerda) */}
      <rect x="3.4" y="13" width="5" height="10.5" rx="2.5" transform="rotate(-32 5.9 18.25)" />
      {/* quatro dedos: indice (mais alto) + medio + anelar + mindinho */}
      <rect x="8" y="2" width="4.3" height="16.5" rx="2.15" />
      <rect x="12.6" y="5.8" width="4.3" height="12.7" rx="2.15" />
      <rect x="17.2" y="6.3" width="4.3" height="12.2" rx="2.15" />
      <rect x="21.8" y="8.5" width="4" height="10" rx="2" />
    </svg>
  );
}
