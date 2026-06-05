import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PillProps {
  children: ReactNode;
  active?: boolean;
  muted?: boolean;
  /** Render as a clickable button (e.g. filter pills) instead of a span. */
  onClick?: () => void;
  className?: string;
  title?: string;
}

/** The only rounded element in the system — mono uppercase tag/filter chip. */
export function Pill({
  children,
  active,
  muted,
  onClick,
  className,
  title,
}: PillProps) {
  const classes = cn(
    'pill',
    active && 'pill-active',
    muted && !active && 'pill-muted',
    className,
  );
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} title={title}>
        {children}
      </button>
    );
  }
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  );
}
