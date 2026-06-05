import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PanelProps {
  children: ReactNode;
  /** Adds the soft hover-lift transition. */
  hoverable?: boolean;
  /** Slightly stronger card shadow. */
  raised?: boolean;
  /** Optional colored top strip (e.g. a deck's accent color). */
  accentStrip?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

/** Generic soft surface card. (Named `Panel` to avoid colliding with `Card`.) */
export function Panel({
  children,
  hoverable,
  raised,
  accentStrip,
  className,
  style,
  onClick,
}: PanelProps) {
  return (
    <div
      className={cn(
        'surface',
        hoverable && 'hover-lift',
        raised && 'offset-shadow',
        onClick && 'cursor-pointer',
        accentStrip && 'overflow-hidden', // clip the strip to rounded corners
        className,
      )}
      style={style}
      onClick={onClick}
    >
      {accentStrip && (
        <div style={{ height: 4, background: accentStrip }} aria-hidden />
      )}
      {children}
    </div>
  );
}
