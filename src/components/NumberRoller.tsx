import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';

/** Vertical roll: the value enters from the side it grew toward and exits opposite. */
const ROLL = {
  enter: (d: number) => ({ y: d * 24, opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit: (d: number) => ({ y: d * -24, opacity: 0 }),
};

interface NumberRollerProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Text shown after the number, e.g. "cards". */
  suffix?: string;
  ariaLabel?: string;
}

/**
 * A compact number "roller": the value slides vertically (up when it grows, down
 * when it shrinks) on every change. Change it with the minus/plus buttons or by
 * scrolling the wheel over it. Clamped to [min, max].
 */
export function NumberRoller({
  value,
  onChange,
  min = 1,
  max = 100,
  step = 1,
  suffix,
  ariaLabel,
}: NumberRollerProps) {
  const [dir, setDir] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  function set(n: number) {
    const next = Math.min(max, Math.max(min, n));
    if (next === valueRef.current) return;
    setDir(next > valueRef.current ? 1 : -1);
    onChange(next);
  }

  // Wheel must be a non-passive listener to roll the number (and not the page).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      set(valueRef.current + (e.deltaY < 0 ? step : -step));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, min, max]);

  return (
    <div
      ref={rootRef}
      className="flex items-stretch overflow-hidden select-none"
      role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      style={{
        height: 42,
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-sm)',
      }}
    >
      <button
        type="button"
        aria-label="Diminuir"
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="px-3 flex items-center text-muted hover:text-fg disabled:opacity-30 transition-colors"
      >
        <Minus size={16} />
      </button>
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence custom={dir} initial={false}>
          <motion.div
            key={value}
            custom={dir}
            variants={ROLL}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center text-sm font-semibold"
          >
            {value}
            {suffix ? ` ${suffix}` : ''}
          </motion.div>
        </AnimatePresence>
      </div>
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="px-3 flex items-center text-muted hover:text-fg disabled:opacity-30 transition-colors"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
