import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

/** Local-hour buckets, kept in sync with the greeting (Bom dia / Boa tarde /
 *  Boa noite). Evening + night both greet "Boa noite". */
export function dayPartForHour(h: number): DayPart {
  if (h >= 5 && h < 11) return 'morning'; // 05:00–10:59
  if (h >= 11 && h < 17) return 'afternoon'; // 11:00–16:59 (day)
  if (h >= 17 && h < 20) return 'evening'; // 17:00–19:59
  return 'night'; // 20:00–04:59
}

/** Current day-part from the device's local hour, re-checked every couple of
 *  minutes so the hero + greeting update live if the clock crosses a boundary
 *  while the app is open. */
export function useDayPart(): DayPart {
  const [dp, setDp] = useState<DayPart>(() => dayPartForHour(new Date().getHours()));
  useEffect(() => {
    const id = setInterval(() => setDp(dayPartForHour(new Date().getHours())), 120_000);
    return () => clearInterval(id);
  }, []);
  return dp;
}

/** One image per bucket (same dimensions/composition, so no layout shift). */
const HERO_IMAGES: Record<DayPart, string> = {
  morning: '/hero-morning.png',
  afternoon: '/hero-day.png',
  evening: '/hero-evening.png',
  night: '/hero-night.png',
};

// Slightly enlarged + biased left to trim the empty right edge; max-width:none
// lifts Tailwind's img cap so the 116% width actually applies and the art covers
// past the right (no card-background strip). objectPosition keeps the tower
// framed when the card is narrow (mobile).
const IMG_STYLE: CSSProperties = {
  position: 'absolute',
  top: '-5%',
  left: '-3%',
  width: '116%',
  height: '110%',
  maxWidth: 'none',
  maxHeight: 'none',
  objectPosition: '72% center',
  transformOrigin: 'center',
  willChange: 'transform, opacity',
};

// Distant-bird strokes (a soft two-arc "m"), centered at the origin so the wing
// flap (d interpolation) and scale stay anchored.
const BIRD_UP = 'M-9,2 Q-4.5,-3.5 0,1 Q4.5,-3.5 9,2';
const BIRD_FLAT = 'M-9,1 Q-4.5,-0.5 0,0.5 Q4.5,-0.5 9,1';

interface Bird {
  yb: number;
  size: number;
  dur: number;
  bobDur: number;
  flapDur: number;
  delay: number;
  opacity: number;
  restX: number;
}

const BIRDS: Bird[] = [
  { yb: 60, size: 1.1, dur: 30, bobDur: 3.0, flapDur: 0.8, delay: 0, opacity: 0.55, restX: 230 },
  { yb: 96, size: 0.82, dur: 40, bobDur: 3.6, flapDur: 1.0, delay: 3, opacity: 0.42, restX: 400 },
  { yb: 76, size: 1.25, dur: 34, bobDur: 2.6, flapDur: 0.72, delay: 7, opacity: 0.6, restX: 320 },
  { yb: 116, size: 0.72, dur: 47, bobDur: 4.0, flapDur: 1.1, delay: 12, opacity: 0.34, restX: 520 },
  { yb: 50, size: 0.95, dur: 32, bobDur: 3.2, flapDur: 0.9, delay: 16, opacity: 0.46, restX: 165 },
];

const BIRD_VBW = 1000;

/**
 * Full-bleed illustrated background for the home greeting hero. The image swaps
 * with the local time of day (morning/day/evening/night) and CROSS-FADES on
 * change (the outgoing frame fades out over the incoming one — no dip). On top
 * of whichever photo is shown, the same animated overlays persist: a soft
 * pulsing/floating sun-glow and a few drifting birds. The image also does a very
 * slight slow zoom + float. Everything is static under prefers-reduced-motion.
 */
export function HeroBackdrop({ part }: { part: DayPart }) {
  const reduce = useReducedMotion();
  const src = HERO_IMAGES[part];

  // Cross-fade: a base layer always shows the current image; when it changes the
  // previous one is layered on top and fades out, revealing the new base.
  const [layers, setLayers] = useState<{ current: string; previous: string | null }>({
    current: src,
    previous: null,
  });
  useEffect(() => {
    setLayers((prev) =>
      prev.current === src ? prev : { current: src, previous: reduce ? null : prev.current },
    );
  }, [src, reduce]);

  // Preload all variants so the first cross-fade isn't blank.
  useEffect(() => {
    for (const s of new Set(Object.values(HERO_IMAGES))) {
      const img = new Image();
      img.src = s;
    }
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* base: current image (slow zoom/float) */}
      <motion.img
        src={layers.current}
        alt=""
        draggable={false}
        className="object-cover select-none"
        style={IMG_STYLE}
        animate={reduce ? undefined : { scale: [1, 1.03, 1], x: [0, -4, 0], y: [0, 2, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* previous image fading out on top → smooth cross-fade */}
      {layers.previous && (
        <motion.img
          key={layers.previous}
          src={layers.previous}
          alt=""
          draggable={false}
          className="object-cover select-none"
          style={IMG_STYLE}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
          onAnimationComplete={() => setLayers((l) => ({ ...l, previous: null }))}
        />
      )}

      {/* soft warm glow over the baked-in sun (~75% across, 40% down) */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(46% 56% at 75% 40%, rgba(255,198,140,0.6) 0%, rgba(255,152,96,0.28) 42%, rgba(255,140,90,0) 72%)',
          mixBlendMode: 'screen',
          transformOrigin: '75% 40%',
          willChange: 'transform, opacity',
        }}
        animate={reduce ? undefined : { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7], x: [0, 5, 0], y: [0, -4, 0] }}
        transition={{
          scale: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
          opacity: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
          x: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
          y: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
        }}
      />

      {/* drifting birds */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${BIRD_VBW} 280`}
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {BIRDS.map((b, i) => (
          <motion.g
            key={i}
            animate={
              reduce
                ? { x: b.restX, y: b.yb, opacity: b.opacity }
                : {
                    x: [-60, BIRD_VBW + 60],
                    y: [b.yb - 3, b.yb + 3, b.yb - 3],
                    opacity: [0, b.opacity, b.opacity, 0],
                  }
            }
            transition={
              reduce
                ? { duration: 0 }
                : {
                    x: { duration: b.dur, repeat: Infinity, ease: 'linear', delay: b.delay },
                    y: { duration: b.bobDur, repeat: Infinity, ease: 'easeInOut' },
                    opacity: { duration: b.dur, times: [0, 0.1, 0.68, 1], repeat: Infinity, ease: 'easeInOut', delay: b.delay },
                  }
            }
          >
            <g transform={`scale(${b.size})`}>
              <motion.path
                d={BIRD_UP}
                fill="none"
                stroke="#f6f3ff"
                strokeWidth={1.7}
                strokeLinecap="round"
                animate={reduce ? { d: BIRD_UP } : { d: [BIRD_UP, BIRD_FLAT, BIRD_UP] }}
                transition={reduce ? { duration: 0 } : { duration: b.flapDur, repeat: Infinity, ease: 'easeInOut' }}
              />
            </g>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
