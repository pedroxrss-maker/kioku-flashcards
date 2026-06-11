import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';
import { cardAssist, isAiConfigured } from './client';
import type { CardAssistAction } from './client';

interface CardAssistBarProps {
  /** Plain-text (HTML stripped) front + back of the card under review. */
  front: string;
  back: string;
}

const ACTIONS: Array<{ id: CardAssistAction; label: string }> = [
  { id: 'example', label: 'Exemplo real' },
  { id: 'breakdown', label: 'Detalhar' },
  { id: 'analogy', label: 'Analogia' },
  { id: 'mnemonic', label: 'Gancho de memória' },
];

/**
 * Inline AI help on the BACK of a review card (between the card and the rating
 * buttons), justified to the card's width. Each button fetches a short pt-BR
 * answer and shows it in a balloon below; the answer is cached per action.
 * Hidden entirely when the AI is not configured.
 */
export function CardAssistBar({ front, back }: CardAssistBarProps) {
  const [active, setActive] = useState<CardAssistAction | null>(null);
  const [cache, setCache] = useState<Partial<Record<CardAssistAction, string>>>({});
  const [error, setError] = useState<string | null>(null);

  if (!isAiConfigured()) return null;

  const loading = active !== null && cache[active] === undefined && error === null;

  async function pick(action: CardAssistAction) {
    if (action === active) {
      setActive(null); // toggle the balloon closed
      return;
    }
    if (loading) return; // one request at a time
    setError(null);
    setActive(action);
    if (cache[action] !== undefined) return; // already fetched
    try {
      const reply = await cardAssist(front, back, action);
      setCache((c) => ({ ...c, [action]: reply }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível falar com a IA.');
    }
  }

  const activeLabel = ACTIONS.find((a) => a.id === active)?.label;
  const text = active ? cache[active] : undefined;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ACTIONS.map((a) => {
          const on = active === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a.id)}
              disabled={loading && !on}
              className="px-3 py-2 rounded-[var(--r-sm)] text-sm text-center transition-colors disabled:opacity-50"
              style={{
                background: on ? 'var(--accent-soft)' : 'var(--surface)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                color: on ? 'var(--accent)' : 'var(--fg)',
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key="assist-balloon"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="p-3 rounded-[var(--r-md)]"
              style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)' }}
            >
              {/* Switching actions fades the old answer out and the new one in. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${active}-${loading ? 'l' : error ? 'e' : 't'}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                    <span className="mono text-[11px] text-muted">{activeLabel}</span>
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
                    <p className="text-sm whitespace-pre-wrap" style={{ lineHeight: 1.55 }}>
                      {text}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
