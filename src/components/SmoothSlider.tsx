import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface SmoothSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  /** Renders the label using the live (dragging) value. */
  label: (v: number) => ReactNode;
  footer?: ReactNode;
  id?: string;
}

/**
 * Range input that tracks its value locally while dragging — so the thumb and
 * label move fluidly with the pointer — and persists once, on release. Avoids
 * the jank of writing to the store on every intermediate step.
 */
export function SmoothSlider({ value, min, max, step, onCommit, label, footer, id }: SmoothSliderProps) {
  const [v, setV] = useState(value);
  const latest = useRef(value);

  // Sync when the persisted value changes from elsewhere.
  useEffect(() => {
    setV(value);
    latest.current = value;
  }, [value]);

  const commit = () => onCommit(latest.current);

  return (
    <div>
      <label className="field-label" htmlFor={id}>{label(v)}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => {
          const nv = Number(e.target.value);
          latest.current = nv;
          setV(nv);
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
        onKeyUp={commit}
        className="w-full accent-[color:var(--accent)]"
        style={{ cursor: 'pointer' }}
      />
      {footer}
    </div>
  );
}
