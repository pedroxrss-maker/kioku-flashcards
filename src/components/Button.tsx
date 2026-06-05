import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'mega' | 'default' | 'accent' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  /** Optional leading icon (e.g. a lucide icon element). */
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  mega: 'btn-mega',
  default: 'btn',
  accent: 'btn btn-accent',
  ghost: 'btn btn-ghost',
};

/** Hard-edged brand button. `mega` is the white→accent primary CTA. */
export function Button({
  variant = 'default',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        VARIANT_CLASS[variant],
        size === 'sm' && variant !== 'mega' && 'btn-sm',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
