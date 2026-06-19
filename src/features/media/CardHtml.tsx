import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveMediaHtml, stripAudioHtml } from './media';
import { sanitizeHtml } from '../../lib/sanitize';

interface CardHtmlProps {
  html: string;
  className?: string;
  /** When false, attached-audio chips are stripped before rendering. */
  audioEnabled?: boolean;
}

/** Shown while a media card's refs sign/resolve, before the real <img> exists,
 *  so the card reserves space and shimmers instead of flashing blank. */
const MEDIA_SKELETON = '<span class="card-img-skeleton" aria-hidden="true"></span>';

/**
 * Enhance one injected <img>: decode async at high priority, reserve space with a
 * shimmer skeleton until it paints, fade in on load, and quietly hide on error
 * (no broken-image icon). Returns a cleanup that detaches its listeners.
 */
function enhanceImg(img: HTMLImageElement): () => void {
  img.decoding = 'async';
  img.setAttribute('fetchpriority', 'high');

  const settle = (failed: boolean) => {
    img.classList.remove('card-img--loading');
    img.classList.add(failed ? 'card-img--failed' : 'card-img--ready');
  };

  // Already cached (e.g. prefetched) or already errored — settle with no shimmer.
  if (img.complete) {
    settle(img.naturalWidth === 0);
    return () => {};
  }

  img.classList.add('card-img--loading');
  const onLoad = () => settle(false);
  const onError = () => settle(true);
  img.addEventListener('load', onLoad, { once: true });
  img.addEventListener('error', onError, { once: true });
  return () => {
    img.removeEventListener('load', onLoad);
    img.removeEventListener('error', onError);
  };
}

/**
 * Renders sanitized card HTML with kioku-media refs resolved to URLs. Images get
 * a reserved-space shimmer placeholder so the card never flashes blank, decode
 * asynchronously at high priority, and fade in on load. The next card's media is
 * prefetched upstream (ReviewSession) so advancing paints instantly.
 */
export function CardHtml({ html, className, audioEnabled = true }: CardHtmlProps) {
  const [resolved, setResolved] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const hasMedia = html.includes('kioku-media://');

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

  // The injected HTML isn't React-managed (dangerouslySetInnerHTML), so enhance
  // its <img>s imperatively. A layout effect runs before paint, so the skeleton
  // is in place on the first frame; it re-runs whenever the resolved HTML changes.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cleanups = Array.from(root.querySelectorAll('img')).map(enhanceImg);
    return () => cleanups.forEach((fn) => fn());
  }, [resolved]);

  return (
    <div
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: resolved || (hasMedia ? MEDIA_SKELETON : '') }}
    />
  );
}
