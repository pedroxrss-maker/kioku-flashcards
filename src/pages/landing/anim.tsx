/**
 * Shared, reduced-motion-aware animation primitives for the landing page.
 * Everything here renders its final, static state when the user prefers reduced
 * motion (no transforms, no repeats, numbers/charts shown complete).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';

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
