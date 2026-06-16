import { useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GraduationCap, Loader2, Sparkles, X } from 'lucide-react';
import { cardAssist, isAiConfigured, tutorTeach } from './client';
import type { CardAssistAction } from './client';
import { recordFeatureUse } from '../gamification/achievements';

interface CardAiHelpProps {
  /** Plain-text (HTML stripped) front + back of the card under review. */
  front: string;
  back: string;
  /** Whether the card is revealed (back). The component stays MOUNTED across
   *  flips so its fetched answers persist; it just renders nothing on the front. */
  flipped: boolean;
}

/** The five AI helpers share ONE pool/metric ("tutor"); only one is active at a
 *  time and its answer shows in a single balloon. */
type AiAction = CardAssistAction | 'tutor';

const ASSIST: Array<{ id: CardAssistAction; label: string }> = [
  { id: 'example', label: 'Exemplo real' },
  { id: 'breakdown', label: 'Detalhar' },
  { id: 'analogy', label: 'Analogia' },
  { id: 'mnemonic', label: 'Gancho de memória' },
];

/** Tutor accent (purple) for the buttons over the dark area. */
const PURPLE = '#a78bfa';
/** Darker tutor ink that stays readable on the WHITE answer balloon. */
const TUTOR_INK = '#7c3aed';
/** Ink + muted ink for text on the white balloon (matches the card). */
const INK = '#17171b';
const INK_MUTED = '#5b5b63';

/** Render one paragraph: collapse soft line breaks so the text flows + justifies,
 *  and turn the model's **key terms** into a discreet highlight. */
function renderInline(para: string): ReactNode[] {
  const flowed = para.replace(/\s*\n\s*/g, ' ').trim();
  return flowed.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part);
    if (m) {
      return (
        <mark key={i} className="ai-hl">
          {m[1]}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/** The AI answer: blank-line paragraphs, justified with 1.5 line spacing, plus a
 *  light highlight on the few terms the model marked — comfortable to read. */
function AiAnswer({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n{2,}/).filter(Boolean);
  return (
    <>
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className="text-sm"
          style={{ textAlign: 'justify', lineHeight: 2, color: INK, marginTop: i === 0 ? 0 : 14 }}
        >
          {renderInline(para)}
        </p>
      ))}
    </>
  );
}

/**
 * AI help on the BACK of a review card. The action buttons sit just under the
 * card (emerging from behind it); the chosen helper's answer appears in a SINGLE
 * balloon that floats to the RIGHT of the card, in the empty space, on wide
 * screens — and as a bottom sheet ABOVE the grade buttons on narrow ones, so it
 * never overlays them (the previous inline balloon grew down over the grades).
 *
 * Rendered inside the card's relative wrapper (`.relative.max-w-2xl`), so the
 * xl right-side balloon anchors to the card's right edge. Hidden entirely when
 * the AI is not configured.
 */
export function CardAiHelp({ front, back, flipped }: CardAiHelpProps) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<AiAction | null>(null);
  const [cache, setCache] = useState<Partial<Record<AiAction, string>>>({});
  const [error, setError] = useState<string | null>(null);

  if (!isAiConfigured()) return null;

  const loading = active !== null && cache[active] === undefined && error === null;

  async function pick(action: AiAction) {
    if (action === active) {
      setActive(null); // toggle the balloon closed
      return;
    }
    if (loading) return; // one request at a time
    setError(null);
    setActive(action);
    if (cache[action] !== undefined) return; // already fetched
    try {
      const reply =
        action === 'tutor' ? await tutorTeach(front, back) : await cardAssist(front, back, action);
      setCache((c) => ({ ...c, [action]: reply }));
      void recordFeatureUse('tutor');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível falar com a IA.');
    }
  }

  const isTutor = active === 'tutor';
  const activeLabel = active ? (isTutor ? 'Tutor' : ASSIST.find((a) => a.id === active)?.label) : '';
  const text = active ? cache[active] : undefined;
  const accent = isTutor ? TUTOR_INK : 'var(--accent)';
  const stateKey = `${active}-${loading ? 'l' : error ? 'e' : 't'}`;

  return (
    <>
      {/* Botões: surgem A PARTIR do card; saem com fade ao voltar à frente. */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            key="ai-buttons"
            className="absolute left-0 right-0 mx-auto w-full max-w-2xl flex flex-col gap-2"
            style={{ top: '100%', zIndex: 0 }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 12 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, transition: { duration: 0.2 } }}
            transition={{ duration: reduce ? 0 : 0.34, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.1 }}
          >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {ASSIST.map((a) => {
            const on = active === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a.id)}
                disabled={loading && !on}
                className="px-2 py-1 text-[11px] sm:text-xs rounded-[var(--r-sm)] text-center ai-hover-outline disabled:opacity-50"
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
        <button
          type="button"
          onClick={() => pick('tutor')}
          className="w-full px-3 py-1.5 text-[11px] sm:text-xs rounded-[var(--r-sm)] font-semibold text-center ai-hover-outline"
          style={{
            background: isTutor ? `color-mix(in srgb, ${PURPLE} 14%, transparent)` : 'var(--surface)',
            border: `1px solid ${isTutor ? PURPLE : 'var(--line)'}`,
            color: PURPLE,
          }}
        >
          Não entendeu? Me ensine isso →
        </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balão da resposta: à direita do card no espaço vazio (xl+); folha
          inferior acima das notas em telas menores. Nunca cobre as notas. Sai
          com fade ao voltar à frente (flipped=false); o cache persiste. */}
      <AnimatePresence>
        {active && flipped && (
          <motion.div
            key="ai-balloon"
            className="kioku-ai-balloon fixed left-3 right-3 bottom-[calc(130px_+_env(safe-area-inset-bottom))] z-40 max-h-[46vh] overflow-y-auto xl:absolute xl:left-full xl:right-auto xl:top-0 xl:bottom-auto xl:z-auto xl:ml-4 xl:max-h-[72vh]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="p-3.5 rounded-[var(--r-md)]"
              style={{
                background: '#fff',
                border: `1px solid ${
                  isTutor ? `color-mix(in srgb, ${TUTOR_INK} 30%, #e6e5e0)` : '#e6e5e0'
                }`,
                boxShadow: 'var(--shadow-pop)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                {/* Tutor mantém o capelo + ganha o símbolo de IA; os demais usam
                    só o símbolo de IA (Sparkles). */}
                {isTutor && <GraduationCap size={13} style={{ color: accent }} />}
                <Sparkles size={13} style={{ color: accent }} />
                <span className="mono text-[11px]" style={{ color: isTutor ? TUTOR_INK : INK_MUTED }}>
                  {activeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label="Fechar"
                  className="ml-auto shrink-0 p-1 rounded-full text-[#8a8a93] hover:text-[#17171b] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              {/* Switching helpers fades the old answer out and the new one in. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={stateKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2 text-sm" style={{ color: INK_MUTED }}>
                      <Loader2 size={14} className="animate-spin" /> Pensando...
                    </span>
                  ) : error ? (
                    <span className="text-sm" style={{ color: 'var(--accent)' }}>
                      {error}
                    </span>
                  ) : (
                    <AiAnswer text={text ?? ''} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
