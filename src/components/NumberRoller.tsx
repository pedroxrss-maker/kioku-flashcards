import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ROW_H = 40;

/** The trio slides one row and crossfades, entering from the side it grew toward. */
const ROLL = {
  enter: (d: number) => ({ y: d * ROW_H, opacity: 0 }),
  center: { y: 0, opacity: 1 },
  exit: (d: number) => ({ y: d * -ROW_H, opacity: 0 }),
};

interface NumberRollerProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Small muted unit shown next to the center number, e.g. "cards". */
  suffix?: string;
  ariaLabel?: string;
}

/**
 * A vertical number wheel: the previous and next values sit dimmed above and
 * below the bold current value, fading out at the edges. Spin it by scrolling or
 * dragging vertically, tap a neighbour to step, or click the center to type a
 * value. Clamped to [min, max].
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  function set(n: number) {
    const next = Math.min(max, Math.max(min, n));
    if (next === valueRef.current) return;
    setDir(next > valueRef.current ? 1 : -1);
    onChange(next);
  }

  function startEdit() {
    setDraft(String(value));
    setEditing(true);
  }
  function commitEdit() {
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) set(n); // set() clamps to [min, max]
    setEditing(false);
  }

  // Scroll over the wheel to change it (non-passive so the page stays put).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scroll up moves toward the smaller value shown above (decrease).
      set(valueRef.current + (e.deltaY < 0 ? -step : step));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, min, max]);

  // Drag to spin: each ROW_H of vertical travel is one step (drag up = increase).
  // movedRef survives pointerup so a drag does not also fire a neighbour tap.
  const dragY = useRef<number | null>(null);
  const movedRef = useRef(false);
  function onPointerDown(e: React.PointerEvent) {
    if (editing) return;
    dragY.current = e.clientY;
    movedRef.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragY.current === null) return;
    const dy = dragY.current - e.clientY; // moving up (dy > 0) increases
    if (Math.abs(dy) >= ROW_H) {
      const steps = Math.trunc(dy / ROW_H);
      set(valueRef.current + steps * step);
      dragY.current -= steps * ROW_H;
      movedRef.current = true;
    }
  }
  function endDrag() {
    dragY.current = null;
  }
  /** Run a click action only if the pointer did not drag into a spin. */
  function tap(fn: () => void) {
    return () => {
      if (movedRef.current) return;
      fn();
    };
  }

  const prev = value - step;
  const next = value + step;
  const hasPrev = prev >= min;
  const hasNext = next <= max;

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={value - step < min}
        aria-label="Diminuir"
        className="shrink-0 grid place-items-center rounded-[var(--r-md)] disabled:opacity-40"
        style={{ width: 48, fontSize: 22, background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--fg)' }}
      >
        −
      </button>
      <div
        ref={rootRef}
        role="spinbutton"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          set(value + step);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          set(value - step);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      className="relative select-none overflow-hidden outline-none flex-1"
      style={{
        height: ROW_H * 3,
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        cursor: editing ? 'text' : 'grab',
        touchAction: 'none',
      }}
    >
      {/* Selected-slot highlight behind the center row. */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: 8,
          right: 8,
          top: ROW_H,
          height: ROW_H,
          borderRadius: 'var(--r-sm)',
          background: 'rgba(255,255,255,0.05)',
        }}
      />
      {editing ? (
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="absolute inset-x-0 bg-transparent text-center font-bold outline-none"
          style={{ top: ROW_H, height: ROW_H, fontSize: 22, color: 'var(--fg)' }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)',
            maskImage: 'linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)',
          }}
        >
          <AnimatePresence custom={dir} initial={false}>
            <motion.div
              key={value}
              custom={dir}
              variants={ROLL}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex flex-col"
            >
              <div
                onClick={tap(() => set(prev))}
                className="flex items-center justify-center cursor-pointer"
                style={{ height: ROW_H, color: 'var(--muted)', fontSize: 17, opacity: hasPrev ? 0.5 : 0 }}
              >
                {hasPrev ? prev : ''}
              </div>
              <div
                onClick={tap(startEdit)}
                className="flex items-center justify-center cursor-text"
                style={{ height: ROW_H }}
                title="Clique para digitar"
              >
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--fg)', lineHeight: 1 }}>
                  {value}
                </span>
                {suffix && (
                  <span className="ml-1.5" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {suffix}
                  </span>
                )}
              </div>
              <div
                onClick={tap(() => set(next))}
                className="flex items-center justify-center cursor-pointer"
                style={{ height: ROW_H, color: 'var(--muted)', fontSize: 17, opacity: hasNext ? 0.5 : 0 }}
              >
                {hasNext ? next : ''}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      </div>
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={value + step > max}
        aria-label="Aumentar"
        className="shrink-0 grid place-items-center rounded-[var(--r-md)] disabled:opacity-40"
        style={{ width: 48, fontSize: 22, background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--fg)' }}
      >
        +
      </button>
    </div>
  );
}
