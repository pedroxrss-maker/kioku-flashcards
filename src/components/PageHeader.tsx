import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="display" style={{ fontSize: 'clamp(28px, 5vw, 40px)' }}>
          {title}
        </h1>
        {subtitle && <p className="text-muted mt-1.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
