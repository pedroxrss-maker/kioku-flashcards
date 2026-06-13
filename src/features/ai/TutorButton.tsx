import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap, Loader2 } from 'lucide-react';
import { isAiConfigured, tutorTeach } from './client';
import { recordFeatureUse } from '../gamification/achievements';

interface TutorButtonProps {
  /** Plain-text (HTML stripped) front + back of the card under review. */
  front: string;
  back: string;
}

/** The tutor accent (purple), distinct from the orange app accent. */
const PURPLE = '#a78bfa';

/**
 * A wide "Não entendeu? Me ensine isso" button (justified to the card width)
 * shown under the AI help buttons. Clicking it pulls a tutor balloon below with
 * a one-shot teaching explanation. Hidden when the AI is not configured.
 */
export function TutorButton({ front, back }: TutorButtonProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAiConfigured()) return null;

  async function teach() {
    if (open) {
      setOpen(false); // toggle the balloon closed
      return;
    }
    setOpen(true);
    if (text !== undefined || loading) return; // already fetched / fetching
    setLoading(true);
    setError(null);
    try {
      setText(await tutorTeach(front, back));
      void recordFeatureUse('tutor');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível falar com o tutor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full flex flex-col gap-2">
      <button
        type="button"
        onClick={teach}
        className="w-full px-4 py-2 text-xs sm:text-[13px] rounded-[var(--r-sm)] font-semibold text-center ai-hover-outline"
        style={{
          background: open ? `color-mix(in srgb, ${PURPLE} 14%, transparent)` : 'var(--surface)',
          border: `1px solid ${open ? PURPLE : 'var(--line)'}`,
          color: PURPLE,
        }}
      >
        Não entendeu? Me ensine isso →
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="tutor-balloon"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="p-3 rounded-[var(--r-md)]"
              style={{
                background: 'var(--surface)',
                border: `1px solid color-mix(in srgb, ${PURPLE} 45%, var(--line-strong))`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <GraduationCap size={13} style={{ color: PURPLE }} />
                <span className="mono text-[11px]" style={{ color: PURPLE }}>
                  tutor
                </span>
              </div>
              {loading ? (
                <span className="inline-flex items-center gap-2 text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" /> Pensando...
                </span>
              ) : error ? (
                <span className="text-sm" style={{ color: 'var(--accent)' }}>
                  {error}
                </span>
              ) : (
                <p className="text-sm whitespace-pre-wrap" style={{ lineHeight: 1.6 }}>
                  {text}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
