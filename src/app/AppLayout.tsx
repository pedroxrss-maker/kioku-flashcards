import { useEffect, useRef } from 'react';
import type { TouchEvent } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../lib/useReducedMotion';
import { MobileTopBar, Sidebar } from './Sidebar';
import { NAV_ITEMS } from './nav';
import { useInitialLoad } from '../db/hooks';

/** Index of the NAV_ITEMS entry that owns the given path (longest prefix). */
function currentNavIndex(pathname: string): number {
  let idx = -1;
  let bestLen = -1;
  NAV_ITEMS.forEach((item, i) => {
    const matches =
      item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (matches && item.to.length > bestLen) {
      bestLen = item.to.length;
      idx = i;
    }
  });
  return idx;
}

/** Shell with the persistent sidebar (desktop) / top bar (mobile). */
export function AppLayout() {
  const { ready, error, reload } = useInitialLoad();
  const nav = useNavigate();
  const loc = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Every page change starts at the top — without this the new route inherits
  // the previous page's scroll position (e.g. tapping a deck from a scrolled-down
  // Home dropped you straight into its heatmap/card list). Skip when navigating to
  // a specific card ("Ver no painel" passes focusCardId and scrolls to that row).
  useEffect(() => {
    if ((loc.state as { focusCardId?: string } | null)?.focusCardId) return;
    window.scrollTo(0, 0);
  }, [loc.pathname, loc.key]);

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Require a deliberate, mostly-horizontal swipe to avoid scroll/tap conflicts.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = currentNavIndex(loc.pathname);
    if (idx < 0) return;
    const nextIdx = dx < 0 ? Math.min(NAV_ITEMS.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (nextIdx !== idx) nav(NAV_ITEMS[nextIdx].to);
  }

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div
        className="flex-1 min-w-0 flex flex-col"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <MobileTopBar />
        {/* overflow-x: clip guards against any accidental horizontal scrollbar */}
        <main
          className="flex-1 w-full max-w-[1200px] mx-auto px-5 md:px-8 py-7 md:py-9"
          style={{ overflowX: 'clip' }}
        >
          {error && !ready ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <p className="text-muted">Não foi possível carregar. Tente novamente.</p>
              <button type="button" className="btn btn-accent" onClick={reload}>
                Tentar novamente
              </button>
            </div>
          ) : !ready ? (
            <div className="flex items-center justify-center py-24">
              <p className="mono text-muted text-sm">Carregando…</p>
            </div>
          ) : (
            // Calm vertical fade + rise between pages (no left/right slide).
            // mode="wait" so the chrome (sidebar/top bar) stays put and only the
            // page content animates: the old page fades out, the new one rises in.
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={loc.pathname}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                {outlet}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
}
