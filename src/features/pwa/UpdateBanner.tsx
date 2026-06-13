import { useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { getUpdateApply, subscribeUpdate } from './updateStore';

/**
 * Small, non-intrusive bottom prompt shown when a new app version is installed
 * and waiting. The app keeps working as-is; tapping "Atualizar" reloads into the
 * new version. We never force a reload. Mounted once at the app root.
 */
export function UpdateBanner() {
  const apply = useSyncExternalStore(subscribeUpdate, getUpdateApply, getUpdateApply);
  const reduce = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  const show = !!apply && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: reduce ? 0 : 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: reduce ? 0 : 90, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-0 right-0 z-[1150] flex justify-center px-3"
          style={{ bottom: 'max(16px, env(safe-area-inset-bottom))', pointerEvents: 'none' }}
          role="status"
          aria-live="polite"
        >
          <div
            className="flex items-center gap-2.5 pl-4 pr-2 py-2 w-full sm:w-auto"
            style={{
              maxWidth: 460,
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-pop)',
              pointerEvents: 'auto',
            }}
          >
            <RefreshCw size={16} style={{ color: 'var(--accent)' }} className="shrink-0" />
            <span className="text-sm flex-1 min-w-0 truncate">Nova versão disponível</span>
            <button type="button" onClick={() => apply?.()} className="btn btn-accent btn-sm shrink-0">
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Agora não"
              className="shrink-0 p-1 rounded-full text-muted hover:text-fg transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
