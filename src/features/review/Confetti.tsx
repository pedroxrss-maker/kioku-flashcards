import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { playConfetti } from '../gamification/sound';

/** Brand-palette confetti. */
const COLORS = ['#ff3b1f', '#1f6dff', '#00b569', '#ff9d00', '#b14cff', '#ff4d9d', '#00c2c7', '#ffd000'];

/**
 * Dependency-free confetti using real DOM pieces + the Web Animations API. Two
 * volleys launch up and inward from the bottom-left and bottom-right corners
 * and arc back down. Portaled to <body> so ancestor transforms/clipping can't
 * hide or misplace it. Respects reduced motion.
 *
 * `sound` plays the synthesized confetti "pop" once on mount — callers pass it
 * only when it should be heard (e.g. a normal session completion, but NOT when a
 * level-up banner fires, since that owns the celebration chime).
 */
export function Confetti({ sound = false }: { sound?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Confetti pop, once when this burst appears (independent of reduced motion).
  useEffect(() => {
    if (sound) playConfetti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduce) return;
    const root = ref.current;
    if (!root || typeof root.animate !== 'function') return; // no WAAPI (e.g. jsdom)

    const W = window.innerWidth;
    const H = window.innerHeight;
    const pieces: HTMLElement[] = [];

    /** Launch a volley from a bottom corner (-1 = left, 1 = right). */
    const volley = (side: -1 | 1, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const el = document.createElement('div');
        const size = 7 + Math.random() * 7;
        const color = COLORS[(Math.random() * COLORS.length) | 0];
        el.style.cssText =
          `position:absolute;left:${side === -1 ? 0 : W}px;top:${H}px;` +
          `width:${size}px;height:${size * 1.5}px;background:${color};` +
          'border-radius:1px;will-change:transform,opacity;';
        root.appendChild(el);
        pieces.push(el);

        // Arc: up + INWARD to a peak, then fall past the bottom while fading.
        // `-side` aims into the screen (left corner -> right, right corner -> left);
        // `side` would fling every piece off the nearest edge (invisible).
        const dx = -side * (W * 0.12 + Math.random() * W * 0.42);
        const peakY = -(H * 0.35 + Math.random() * H * 0.5);
        const rot = Math.random() * 900 - 450;
        const duration = 1700 + Math.random() * 1500;
        const anim = el.animate(
          [
            { transform: 'translate(0px,0px) rotate(0deg)', opacity: 1, offset: 0 },
            { transform: `translate(${dx * 0.6}px, ${peakY}px) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.45 },
            { transform: `translate(${dx}px, ${H * 0.2}px) rotate(${rot}deg)`, opacity: 0, offset: 1 },
          ],
          { duration, easing: 'cubic-bezier(0.2, 0.55, 0.35, 1)', fill: 'forwards' },
        );
        anim.onfinish = () => el.remove();
      }
    };

    volley(-1, 70);
    volley(1, 70);
    const t = window.setTimeout(() => {
      volley(-1, 45);
      volley(1, 45);
    }, 240);

    return () => {
      window.clearTimeout(t);
      pieces.forEach((p) => p.remove());
    };
  }, [reduce]);

  return createPortal(
    <div
      ref={ref}
      aria-hidden
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}
    />,
    document.body,
  );
}
