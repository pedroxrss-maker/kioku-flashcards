import { useEffect, useState } from 'react';
import { resolveMediaHtml, stripAudioHtml } from './media';
import { sanitizeHtml } from '../../lib/sanitize';

interface CardHtmlProps {
  html: string;
  className?: string;
  /** When false, attached-audio chips are stripped before rendering. */
  audioEnabled?: boolean;
}

/** Renders sanitized card HTML with kioku-media refs resolved to object URLs. */
export function CardHtml({ html, className, audioEnabled = true }: CardHtmlProps) {
  const [resolved, setResolved] = useState('');

  useEffect(() => {
    let alive = true;
    const prepared = audioEnabled ? sanitizeHtml(html) : stripAudioHtml(sanitizeHtml(html));
    resolveMediaHtml(prepared).then((r) => {
      if (alive) setResolved(r);
    });
    return () => {
      alive = false;
    };
  }, [html, audioEnabled]);

  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: resolved }} />
  );
}
