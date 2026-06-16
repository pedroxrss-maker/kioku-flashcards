import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface BackLinkProps {
  /** Route to navigate to. Omit and pass `onClick` for history-back / custom. */
  to?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * A "return to the previous page" link with a little life: on hover it lifts to a
 * soft pill, brightens, and the arrow slides left. Renders a <Link> when `to` is
 * given, otherwise a <button> (e.g. history back). Shared so every back control
 * feels the same.
 */
export function BackLink({ to, onClick, children, className }: BackLinkProps) {
  const inner = (
    <>
      <ArrowLeft size={14} className="back-link-arrow" />
      <span>{children}</span>
    </>
  );
  const cls = cn('back-link', className);
  if (to) {
    return (
      <Link to={to} className={cls} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
