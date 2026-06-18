import { useEffect, useState } from 'react';

/**
 * True on mobile-width viewports (below Tailwind's `md` = 768px), tracked live.
 *
 * SSR / test-safe: returns false when `matchMedia` is unavailable. Used to drop
 * touch-only affordances that fight native scrolling — e.g. the landing page's
 * draggable float — WITHOUT changing desktop behavior.
 */
const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
