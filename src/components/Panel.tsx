import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PanelProps {
  children: ReactNode;
  /** Adds the brand hover-lift transition. */
  hoverable?: boolean;
  /** Renders the 10px offset solid shadow (white, or accent on hover). */
  raised?: boolean;
  /** Optional colored top strip (e.g. a deck's accent color). */
  accentStrip?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

/**
 * Generic raised surface — the brutalist panel primitive. Named `Panel` to
 * avoid colliding with the domain `Card` entity.
 */
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
        className,
      )}
      style={style}
      onClick={onClick}
    >
      {accentStrip && (
        <div style={{ height: 6, background: accentStrip }} aria-hidden />
      )}
      {children}
    </div>
  );
}
