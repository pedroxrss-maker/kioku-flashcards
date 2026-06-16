import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getPendingUpdate } from './updateStore';

/**
 * An ACTIVE review session lives at /review/:deckId. Reloading there would drop
 * the in-memory session (queue position / current card), so we NEVER auto-apply
 * an update while on it. /review (the hub) and every other route are safe.
 */
function isReviewSession(pathname: string): boolean {
  return /^\/review\/.+/.test(pathname);
}

/**
 * Soft (hybrid) auto-update — no UI, no button.
 *
 * registerPwa records a pending update (a waiting service worker) in updateStore.
 * This component applies it SILENTLY at the next SAFE moment:
 *   - a route navigation to a non-review path, or
 *   - the app being re-opened / re-focused (tab visible again or window focus),
 * and NEVER while the user is mid-review. Applying = run the skip-waiting trigger,
 * which leads to controllerchange → reload (handled in registerPwa) into the new
 * version. If no safe moment occurs, the update simply lands on the next app load
 * (page navigations are network-first, so the newest HTML/bundles are served).
 *
 * Must be mounted INSIDE the Router (it uses useLocation).
 */
export function PwaAutoUpdate(): null {
  const location = useLocation();
  const firstRun = useRef(true);

  // Apply on route navigation. Skip the initial mount (that is not a navigation)
  // and skip while entering/inside a review session.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (isReviewSession(location.pathname)) return;
    getPendingUpdate()?.();
  }, [location.pathname]);

  // Apply when the app is re-opened / re-focused, unless we are mid-review.
  useEffect(() => {
    const tryApply = () => {
      if (document.visibilityState !== 'visible') return;
      if (isReviewSession(window.location.pathname)) return;
      getPendingUpdate()?.();
    };
    document.addEventListener('visibilitychange', tryApply);
    window.addEventListener('focus', tryApply);
    return () => {
      document.removeEventListener('visibilitychange', tryApply);
      window.removeEventListener('focus', tryApply);
    };
  }, []);

  return null;
}
