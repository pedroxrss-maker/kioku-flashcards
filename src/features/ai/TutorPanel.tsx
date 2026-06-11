import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GraduationCap, Loader2, Send, X } from 'lucide-react';
import { tutorReply } from './client';
import type { AiMessage } from './client';

interface TutorPanelProps {
  open: boolean;
  onClose: () => void;
  /** Plain-text (HTML stripped) front + back of the card under review. */
  front: string;
  back: string;
}

const SEED = 'Me ajude a entender este card.';

/**
 * Contextual tutor chat shown over a review (right side panel). Renders ON TOP of
 * the review without touching its state, so opening/closing it never resets the
 * session. Multi-turn: the full conversation is kept in component state and sent
 * with every call. Mounted once per card (keyed by card id upstream).
 */
export function TutorPanel({ open, onClose, front, back }: TutorPanelProps) {
  const reduce = useReducedMotion();
  const [turns, setTurns] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: AiMessage[] = [...turns, { role: 'user', content: t }];
    setTurns(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const reply = await tutorReply({ front, back, history: next });
      setTurns((cur) => [...cur, { role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível falar com o tutor.');
    } finally {
      setBusy(false);
    }
  }

  // Auto-start the conversation the first time the panel is opened for this card.
  useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      void send(SEED);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes the tutor (the review handles its own keys only when closed).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={onClose}
          />
          <motion.aside
            className="relative h-full w-full max-w-md flex flex-col"
            style={{ background: 'var(--bg)', borderLeft: '1px solid var(--line)' }}
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <header
              className="flex items-center justify-between gap-3 px-4 h-14 border-b shrink-0"
              style={{ borderColor: 'var(--line)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GraduationCap size={18} className="text-accent shrink-0" />
                <span className="font-bold text-sm truncate">Tutor IA</span>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar tutor"
                className="p-1.5 text-muted hover:text-fg transition-colors"
              >
                <X size={18} />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {turns.map((m, i) => (
                <div
                  key={i}
                  className={m.role === 'user' ? 'self-end max-w-[85%]' : 'self-start max-w-[92%]'}
                >
                  <div
                    className="text-sm whitespace-pre-wrap"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--r-md)',
                      background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--surface)',
                      border: '1px solid var(--line)',
                      lineHeight: 1.55,
                    }}
                  >
                    {typeof m.content === 'string' ? m.content : ''}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="self-start inline-flex items-center gap-2 text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" /> Pensando...
                </div>
              )}
              {error && (
                <div className="self-start text-sm" style={{ color: 'var(--accent)', lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
            </div>

            <div
              className="border-t p-3 shrink-0 flex items-end gap-2"
              style={{ borderColor: 'var(--line)' }}
            >
              <textarea
                className="field flex-1"
                rows={1}
                value={input}
                placeholder="Pergunte ao tutor..."
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                style={{ resize: 'none', minHeight: 40, maxHeight: 120 }}
              />
              <button
                type="button"
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                aria-label="Enviar"
                className="btn btn-accent shrink-0 disabled:opacity-50"
                style={{ height: 40 }}
              >
                <Send size={16} />
              </button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
