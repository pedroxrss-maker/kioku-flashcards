/**
 * Shared, reduced-motion-aware animation primitives for the landing page.
 * Everything here renders its final, static state when the user prefers reduced
 * motion (no transforms, no repeats, numbers/charts shown complete).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { animate, motion, useInView } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useIsMobile } from '../../lib/useIsMobile';
import { cn } from '../../lib/cn';

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Smooth-scroll to a section id (instant under reduced motion). */
export function scrollToId(id: string, reduce?: boolean | null): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  y?: number;
}

/** Fade + rise once when scrolled into view. */
export function Reveal({ children, className, style, delay = 0, y = 24 }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
export const staggerItem = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

interface GroupProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Parent for a staggered grid; pair with <StaggerCard> children. */
export function StaggerGroup({ children, className, style }: GroupProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      className={className}
      style={style}
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerCard({ children, className, style }: GroupProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <motion.div className={className} style={style} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/**
 * Count up to `value` once the element scrolls into view. Returns a ref to
 * attach to a wrapper and the current display value (final value immediately
 * under reduced motion).
 */
export function useCountUp(value: number, duration = 1.5) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, reduce, duration]);

  return { ref, value: display };
}

/**
 * Floating + draggable wrapper, like the hero pieces. The continuous float is a
 * compositor-only CSS animation (`.kf-float` = vertical bob, `.kf-float-x` = a
 * slower horizontal drift): two pure translations on different periods, so the
 * motion is organic, never pauses at the extremes, stays razor-sharp (no
 * rotate/scale to blur text), and costs the main thread nothing even with many
 * cards floating at once. Framer-motion is used ONLY for the interactive drag
 * (springs back within `dragPct` of the element's size) and the hover scale.
 * Renders static (no float/drag) under reduced motion.
 */
export function FloatCard({
  children,
  className,
  style,
  dur = 6,
  delay = 0,
  bob = 11,
  drift = 5,
  dragPct = 0.1,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  dur?: number;
  delay?: number;
  bob?: number;
  drift?: number;
  dragPct?: number;
}) {
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const rx = size.w * dragPct;
  const ry = size.h * dragPct;
  const floatVars = {
    '--float-dur': `${dur}s`,
    '--float-delay': `${delay}s`,
    '--float-bob': `${bob}px`,
    '--float-drift': `${drift}px`,
  } as CSSProperties;

  return (
    <div className={cn('kf-float', className)} style={{ ...floatVars, ...style }}>
      <div className="kf-float-x">
        <motion.div
          ref={ref}
          // No mobile o card NAO e arrastavel (nao competir com o scroll da
          // pagina); o float em CSS continua. No desktop, arrasto normal.
          drag={!isMobile}
          dragConstraints={{ left: -rx, right: rx, top: -ry, bottom: ry }}
          dragElastic={0.16}
          dragSnapToOrigin
          whileHover={isMobile ? undefined : { scale: 1.035 }}
          whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
          transition={{ type: 'spring', stiffness: 380, damping: 12 }}
          style={{
            height: '100%',
            cursor: isMobile ? 'default' : 'grab',
            touchAction: isMobile ? undefined : 'none',
            backfaceVisibility: 'hidden',
          }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
