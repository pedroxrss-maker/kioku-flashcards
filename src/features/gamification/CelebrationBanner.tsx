import { useEffect, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Trophy, X } from 'lucide-react';
import { Confetti } from '../review/Confetti';
import { useSettings } from '../../db/hooks';
import {
  dismissCelebration,
  getCelebration,
  subscribeCelebration,
} from './celebration';
import { playCelebration } from './sound';

const AUTO_DISMISS_MS = 4500;

/**
 * Full-width banner that slides down from the top like a phone push
 * notification, auto-dismisses, and fires a confetti burst + a celebration
 * chime. Mounted once at the app root; driven by the celebration store, so any
 * feature (level-ups now, achievements later) shows one by calling celebrate().
 */
export function CelebrationBanner() {
  const celebration = useSyncExternalStore(subscribeCelebration, getCelebration, getCelebration);
  const settings = useSettings();
  const reduce = useReducedMotion();

  // On each new celebration: play the chime (unless muted) and arm auto-dismiss.
  useEffect(() => {
    if (!celebration) return;
    if (settings?.celebrationSound !== false) playCelebration();
    const t = window.setTimeout(() => dismissCelebration(celebration.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration?.id]);

  const isLevelUp = celebration?.kind === 'levelup';
  const accent = isLevelUp ? 'var(--accent)' : '#a78bfa';
  const accentBg = isLevelUp ? 'var(--accent-soft)' : 'rgba(167, 139, 250, 0.14)';

  return (
    <>
      <AnimatePresence>
        {celebration && (
          <motion.div
            key={celebration.id}
            initial={{ y: reduce ? 0 : -120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: reduce ? 0 : -120, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-0 right-0 z-[1200] flex justify-center px-3"
            style={{ top: 'max(12px, env(safe-area-inset-top))', pointerEvents: 'none' }}
            role="status"
            aria-live="polite"
          >
            <div
              onClick={() => dismissCelebration(celebration.id)}
              className="flex items-center gap-3.5 px-4 py-3.5 w-full cursor-pointer"
              style={{
                maxWidth: 480,
                background: 'var(--surface)',
                border: `1px solid ${accent}`,
                borderRadius: 'var(--r-lg)',
                boxShadow: 'var(--shadow-pop)',
                pointerEvents: 'auto',
              }}
            >
              <span
                className="shrink-0 grid place-items-center rounded-[var(--r-md)]"
                style={{ width: 40, height: 40, background: accentBg, color: accent }}
              >
                {isLevelUp ? <Sparkles size={20} /> : <Trophy size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm leading-tight">{celebration.title}</p>
                <p className="text-xs text-muted mt-0.5" style={{ lineHeight: 1.4 }}>
                  {celebration.message}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissCelebration(celebration.id);
                }}
                aria-label="Dispensar"
                className="shrink-0 -mr-1 p-1 rounded-[var(--r-sm)] text-muted hover:text-fg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fresh confetti burst per celebration; the banner owns the chime, so the
          confetti stays silent here (sound={false}). */}
      {celebration && <Confetti key={celebration.id} sound={false} />}
    </>
  );
}
