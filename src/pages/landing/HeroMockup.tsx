/**
 * Hero product mockup: a dark, floating, interactive "app screenshot" mirroring
 * the real review screen. A tilted main flashcard with a stacked-deck shadow,
 * three satellite cards (streak / progress / evolution) spread to the right, and
 * the four self-rating buttons below. Everything bobs gently (out of sync) and
 * shifts slightly on scroll. Absolute layout inside a responsive scaler so the
 * exact composition (tilt, offsets, layering) holds at any width.
 *
 * Respects prefers-reduced-motion: static final positions, no float/parallax.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { ArrowRight, Flame, MoreVertical, Star } from 'lucide-react';
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

const ANSWERS = [
  { rating: 'again', sub: 'errei', color: 'var(--accent)', text: '#ffffff' },
  { rating: 'hard', sub: 'acertei, mas demorei', color: 'var(--accent-amber)', text: '#1a1205' },
  { rating: 'good', sub: 'sei', color: 'var(--accent-green)', text: '#04130c' },
  { rating: 'easy', sub: 'fácil demais', color: 'var(--accent-blue)', text: '#ffffff' },
];

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

/* ----------------------------------------------- main flashcard ----------- */
function MainCard() {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const W = 300;
  const H = 252;

  const face: CSSProperties = {
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
  const sil: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 20,
    boxShadow: '0 18px 36px rgba(0,0,0,0.42)',
  };

  return (
    <div
      style={{ position: 'relative', width: W, height: H, perspective: TILT_PERSPECTIVE, cursor: 'pointer' }}
      // Hover/click live on this FLAT wrapper (a normal rectangular hit box that
      // covers the whole card), not on the 3D-transformed card inside — 3D
      // hit-testing only catches the painted text, so hovering empty areas missed.
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onClick={() => setFlipped((f) => !f)}
    >
      {/* Shared 3D frame: the card leans back into depth (rotateX/rotateY) with a
          hint of in-plane tilt (rotateZ). The tilt lives HERE; the float
          (translateY) lives on an ANCESTOR wrapper (Bob/FloatItem), so the two
          compose and never overwrite each other. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: TILT_TRANSFORM,
        }}
      >
        {/* three stacked silhouettes receding in depth (translateZ) behind the main
            card; the furthest is dimmer (appears smaller in perspective) for added
            depth without clutter */}
        <div style={{ ...sil, opacity: 0.6, transform: 'translate(44px, 40px) translateZ(-82px) rotate(3deg)' }} />
        <div style={{ ...sil, transform: 'translate(24px, 22px) translateZ(-52px) rotate(1.5deg)' }} />
        <div style={{ ...sil, transform: 'translate(-12px, 13px) translateZ(-26px) rotate(-1deg)' }} />

        {/* main flip card — covers the whole card surface, so hovering anywhere on
            it flips to the back (and back to front on leave). The rotateY flip lives
            inside the tilted, preserve-3d frame, so it keeps the 3D perspective. */}
        <motion.div
          style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', pointerEvents: 'none' }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }}
        >
          {/* FRONT */}
          <div style={face}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={pill}>Frente</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <Star size={17} color="var(--accent-amber)" fill="var(--accent-amber)" />
                <MoreVertical size={17} color="var(--muted)" />
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <p style={{ color: 'var(--fg)', fontSize: 19, fontWeight: 600, lineHeight: 1.35, fontFamily: 'var(--body)' }}>
                Qual é a principal função das mitocôndrias na célula?
              </p>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--muted)', fontSize: 13, fontFamily: 'var(--body)' }}>
              <ArrowRight size={15} /> Clique para ver a resposta
            </span>
          </div>

          {/* BACK — answer text above the illustration; bg matches the mitochondria image */}
          <div style={{ ...face, background: '#16171B', transform: 'rotateY(180deg)', padding: '16px 16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={pill}>Verso</span>
              <Star size={17} color="var(--accent-amber)" fill="var(--accent-amber)" />
            </div>
            <span style={{ color: 'var(--fg)', fontSize: 15, fontWeight: 600, fontFamily: 'var(--body)', textAlign: 'center', marginBottom: 4 }}>
              Produzir energia (ATP) para a célula.
            </span>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {imgOk ? (
                <img
                  src="/mitochondria-atp.png"
                  alt="Mitocôndria: a respiração celular gera ATP, a energia da célula"
                  onError={() => setImgOk(false)}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                />
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.4, fontFamily: 'var(--body)', textAlign: 'center' }}>
                  São as usinas de energia da célula.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ----------------------------------------------- answer buttons ----------- */
function AnswerButtons() {
  const reduce = useReducedMotion();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      {ANSWERS.map((a) => {
        // Each button tilts on its own (narrow element = gentle foreshortening) and
        // is freely draggable on its own — no tether, stays where you drop it.
        const chip = (
          <Tilt3D fill>
            <div className="answer-chip" style={{ '--bc': a.color, '--tc': a.text, height: '100%' } as CSSProperties}>
              <span className="chip-sub" style={{ display: 'block', fontSize: 9, lineHeight: 1.2 }}>{a.sub}</span>
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
        <Flame size={21} color="var(--accent-amber)" fill="var(--accent-amber)" />
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

  return (
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
    </Scaler>
  );
}
