import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { CardHtml } from '../media/CardHtml';
import { SpeakerButton } from '../tts/SpeakerButton';
import { stripTypeInMark, normalizeAnswer } from '../../lib/cardType';
import { stripHtml } from '../../lib/text';
import { cn } from '../../lib/cn';

interface TypeInCardProps {
  front: string;
  back: string;
  ttsLang: string;
  /** Whether the answer has been revealed/checked. */
  revealed: boolean;
  onReveal: () => void;
  height?: string;
  audioEnabled?: boolean;
}

/**
 * "Type in the answer" review card. The user types the answer into an input and
 * presses Enter (or "Mostrar resposta") to check it; the expected answer is then
 * revealed with a correct/incorrect indicator and their typed text for compare.
 */
export function TypeInCard({
  front,
  back,
  ttsLang,
  revealed,
  onReveal,
  height = 'clamp(280px, 46vh, 440px)',
  audioEnabled = true,
}: TypeInCardProps) {
  const promptHtml = useMemo(() => stripTypeInMark(front), [front]);
  const expected = useMemo(() => stripHtml(back), [back]);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when a fresh card appears (component is remounted per card).
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  // Once revealed, release focus so the global keys can rate the card.
  useEffect(() => {
    if (revealed) inputRef.current?.blur();
  }, [revealed]);

  const correct = revealed && normalizeAnswer(typed) === normalizeAnswer(expected);

  return (
    <div className="flip-scene w-full max-w-2xl">
      <div className="cloze-card" style={{ minHeight: height }}>
        {audioEnabled && (
          <div className="absolute top-3 right-3">
            <SpeakerButton text={expected} lang={ttsLang} size={18} onLight />
          </div>
        )}
        <div className="w-full max-w-xl">
          <CardHtml html={promptHtml} className="card-content" audioEnabled={audioEnabled} />

          <input
            ref={inputRef}
            value={typed}
            disabled={revealed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !revealed) {
                e.preventDefault();
                onReveal();
              }
            }}
            placeholder="Digite a resposta e pressione Enter…"
            className="typein-input"
            aria-label="Resposta"
          />

          <AnimatePresence initial={false}>
            {revealed && (
              <motion.div
                key="typein-answer"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div className="my-4 h-px w-full" style={{ background: '#0f0f0f22' }} />
                <div
                  className={cn('typein-result', correct ? 'typein-ok' : 'typein-bad')}
                >
                  {correct ? <Check size={16} /> : <X size={16} />}
                  <span>{correct ? 'Correto!' : 'Resposta esperada:'}</span>
                </div>
                {!correct && (
                  <p className="typein-expected">{expected}</p>
                )}
                {!correct && typed.trim() && (
                  <p className="typein-yours">
                    Você digitou: <span>{typed}</span>
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
