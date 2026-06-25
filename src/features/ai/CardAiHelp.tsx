import { useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Brain, GraduationCap, List, Loader2, Scale, Search, Sparkles, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cardAssist, isAiConfigured, QuotaError, tutorTeach } from './client';
import type { CardAssistAction } from './client';
import { recordFeatureUse } from '../gamification/achievements';
import { useUpgradeModal } from '../billing/UpgradeModalProvider';

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

const ASSIST: Array<{ id: CardAssistAction; label: string; icon: LucideIcon }> = [
  { id: 'example', label: 'Exemplo real', icon: Search },
  { id: 'breakdown', label: 'Detalhar', icon: List },
  { id: 'analogy', label: 'Analogia', icon: Scale },
  { id: 'mnemonic', label: 'Gancho de memória', icon: Brain },
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

/** Header row for an AI answer: the AI mark (+ tutor cap) and the helper label. */
function AiHeader({ isTutor, label, accent }: { isTutor: boolean; label: string; accent: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Tutor mantém o capelo + ganha o símbolo de IA; os demais usam só o
          símbolo de IA (Sparkles). */}
      {isTutor && <GraduationCap size={13} style={{ color: accent }} />}
      <Sparkles size={13} style={{ color: accent }} />
      <span className="mono text-[11px]" style={{ color: isTutor ? TUTOR_INK : INK_MUTED }}>
        {label}
      </span>
    </div>
  );
}

/** Answer body: "Pensando..." -> answer (or error), with a soft crossfade between
 *  states and when switching helpers. Shared by the desktop balloon and the
 *  mobile in-card view, so both fade the text in the same way. */
function AiBody({
  loading,
  error,
  text,
  stateKey,
}: {
  loading: boolean;
  error: string | null;
  text: string | undefined;
  stateKey: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stateKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
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
  );
}

/**
 * AI help on the BACK of a review card. The action buttons sit just under the
 * card (emerging from behind it); the chosen helper's answer appears in a SINGLE
 * place that depends on width: on wide screens (xl+) a balloon floats to the
 * RIGHT of the card, in the empty space; on narrow screens it takes over the card
 * itself, covering the back face with the same background (the verso stays
 * underneath) so it never crowds the grade buttons. Tapping the card on mobile
 * fades the answer out, revealing the verso again; the cache is kept (tapping only
 * closes the open answer, it does not erase it).
 *
 * Rendered inside the card's relative wrapper (`.relative.max-w-2xl`), so the xl
 * balloon anchors to the card's right edge and the mobile overlay (absolute
 * inset-0) covers the card exactly. Hidden entirely when the AI is not configured.
 */
export function CardAiHelp({ front, back, flipped }: CardAiHelpProps) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<AiAction | null>(null);
  const [cache, setCache] = useState<Partial<Record<AiAction, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const { openUpgrade } = useUpgradeModal();

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
      // Stream the reply: append each token chunk into this action's cache entry,
      // so the bubble fills in progressively (the "Pensando..." state clears the
      // moment the first chunk lands — cache[action] becomes a string).
      const onToken = (delta: string) =>
        setCache((c) => ({ ...c, [action]: (c[action] ?? '') + delta }));
      const reply =
        action === 'tutor'
          ? await tutorTeach(front, back, onToken)
          : await cardAssist(front, back, action, onToken);
      // Settle on the final (trimmed) text once streaming finishes.
      setCache((c) => ({ ...c, [action]: reply }));
      void recordFeatureUse('tutor');
    } catch (e) {
      // Free user hit the AI limit → upsell modal instead of a dead-end error.
      if (e instanceof QuotaError && openUpgrade(e.info.metric)) return;
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
      {/* Botões de IA — DESKTOP (xl+): coluna vertical À ESQUERDA do card. Só com
          o verso revelado; surgem de DENTRO do card para a esquerda (slide-fade) e
          somem igual. zIndex abaixo do card p/ a entrada parecer sair de dentro. */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            key="ai-buttons-left"
            className="hidden xl:flex xl:flex-col xl:justify-between xl:gap-2 xl:absolute xl:right-full xl:top-0 xl:bottom-0 xl:mr-4 xl:w-36"
            style={{ zIndex: 0 }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 36, transition: { duration: 0.2 } }}
            transition={{ duration: reduce ? 0 : 0.34, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.1 }}
          >
            {ASSIST.map((a) => {
              const on = active === a.id;
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pick(a.id)}
                  disabled={loading && !on}
                  className="flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-[var(--r-md)] text-center ai-hover-outline disabled:opacity-50"
                  style={{
                    background: on ? 'var(--accent-soft)' : 'var(--surface)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                    color: on ? 'var(--accent)' : 'var(--fg)',
                  }}
                >
                  <Icon size={18} />
                  <span className="text-xs leading-tight">{a.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => pick('tutor')}
              className="px-3 py-2.5 rounded-[var(--r-md)] text-xs font-semibold text-center leading-tight ai-hover-outline"
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

      {/* Botões — MOBILE/TABLET (< xl): grade abaixo do card; saem com fade. */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            key="ai-buttons"
            data-ai-below
            className="xl:hidden absolute left-0 right-0 mx-auto w-full max-w-2xl flex flex-col gap-2"
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
        {/* sm+: tutor abaixo do card. Em telas menores ele vai ACIMA (abaixo
            sobreporia as notas de resposta), renderizado no bloco seguinte. */}
        <button
          type="button"
          onClick={() => pick('tutor')}
          className="hidden sm:block xl:hidden w-full px-3 py-1.5 text-xs rounded-[var(--r-sm)] font-semibold text-center ai-hover-outline"
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

      {/* Telas menores: o botão do tutor fica ACIMA do card, para não sobrepor os
          botões de resposta logo abaixo. Mesma ação (pick('tutor')). */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            key="ai-tutor-top"
            className="sm:hidden absolute left-0 right-0 mx-auto w-full max-w-2xl"
            style={{ bottom: '100%', marginBottom: 12, zIndex: 0 }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, transition: { duration: 0.2 } }}
            transition={{ duration: reduce ? 0 : 0.34, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.1 }}
          >
            <button
              type="button"
              onClick={() => pick('tutor')}
              className="w-full px-3 py-1.5 text-[11px] rounded-[var(--r-sm)] font-semibold text-center ai-hover-outline"
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

      {/* DESKTOP (xl+): balão à direita do card, no espaço preto vazio. Sai com
          fade ao voltar à frente (flipped=false); o cache persiste. */}
      <AnimatePresence>
        {active && flipped && (
          <motion.div
            key="ai-balloon"
            className="kioku-ai-balloon hidden xl:block xl:absolute xl:left-full xl:right-auto xl:top-0 xl:ml-4 xl:max-h-[72vh] xl:overflow-y-auto"
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
                <AiHeader isTutor={isTutor} label={activeLabel ?? ''} accent={accent} />
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label="Fechar"
                  className="ml-auto shrink-0 p-1 rounded-full text-[#8a8a93] hover:text-[#17171b] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <AiBody loading={loading} error={error} text={text} stateKey={stateKey} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE (< xl): a resposta da IA assume o lugar do verso DENTRO do card,
          cobrindo a face de trás com o mesmo fundo (o verso continua por baixo).
          O título do botão de IA fica no canto superior esquerdo e o texto entra
          com fade. Tocar no card fecha o balão com fade, revelando o verso de
          novo; o cache é preservado (só fecha, não apaga). */}
      <AnimatePresence>
        {active && flipped && (
          <motion.div
            key="ai-incard"
            onClick={() => setActive(null)}
            role="button"
            tabIndex={-1}
            aria-label="Voltar ao verso do card"
            className="xl:hidden absolute inset-0 z-20 cursor-pointer overflow-y-auto"
            style={{
              background: '#fbfbfa',
              borderRadius: 'var(--r-lg)',
              padding: 'clamp(20px, 4vw, 40px)',
              fontWeight: 700,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-2">
              <AiHeader isTutor={isTutor} label={activeLabel ?? ''} accent={accent} />
            </div>
            <AiBody loading={loading} error={error} text={text} stateKey={stateKey} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
