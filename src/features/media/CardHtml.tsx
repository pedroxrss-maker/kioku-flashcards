import { useEffect, useState } from 'react';
import { resolveMediaHtml } from './media';
import { sanitizeHtml } from '../../lib/sanitize';

interface CardHtmlProps {
  html: string;
  className?: string;
}

/** Renders sanitized card HTML with kioku-media refs resolved to object URLs. */
export function CardHtml({ html, className }: CardHtmlProps) {
  const [resolved, setResolved] = useState('');

  useEffect(() => {
    let alive = true;
    resolveMediaHtml(sanitizeHtml(html)).then((r) => {
      if (alive) setResolved(r);
    });
    return () => {
      alive = false;
    };
  }, [html]);

  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: resolved }} />
  );
}
