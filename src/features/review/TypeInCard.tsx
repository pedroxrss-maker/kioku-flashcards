import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { CardHtml } from '../media/CardHtml';
import { SpeakerButton } from '../tts/SpeakerButton';
import { PlayAudioButton } from './PlayAudioButton';
import { stripTypeInMark, normalizeAnswer } from '../../lib/cardType';
import { stripHtml } from '../../lib/text';
import { cn } from '../../lib/cn';
import type { Rating } from '../../db/types';

interface TypeInCardProps {
  front: string;
  back: string;
  ttsLang: string;
  /** Whether the answer is revealed (drives the grade buttons in the parent). */
  revealed: boolean;
  /** Reveal the answer (first Enter). */
  onReveal: () => void;
  /** Grade the card and advance (Enter auto-grades; 1-4 grade manually). */
  onResolve: (rating: Rating) => void;
  height?: string;
  audioEnabled?: boolean;
  /** The prompt (front) has its own audio track. */
  hasFrontAudio?: boolean;
  onReplayFrontAudio?: () => void;
  /** The answer (back) has its own audio track. */
  hasBackAudio?: boolean;
  onReplayBackAudio?: () => void;
}

/**
 * "Type in the answer" card:
 *   - Type the answer; pressing Enter at any point ALWAYS reveals the answer
 *     first (with a correct/incorrect indicator), which surfaces the
 *     again/hard/good/easy buttons.
 *   - Once revealed, Enter advances (auto-graded: correct -> "good", wrong ->
 *     "again"); 1-4 grade manually; or click a grade button.
 * The input keeps focus throughout, so the global review shortcuts never fire
 * here, this card owns its keyboard entirely.
 */
const KEY_RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];
export function TypeInCard({
  front,
  back,
  ttsLang,
  revealed,
  onReveal,
  onResolve,
  height = 'clamp(280px, 46vh, 440px)',
  audioEnabled = true,
  hasFrontAudio = false,
  onReplayFrontAudio,
  hasBackAudio = false,
  onReplayBackAudio,
}: TypeInCardProps) {
  const promptHtml = useMemo(() => stripTypeInMark(front), [front]);
  const promptText = useMemo(() => stripHtml(promptHtml), [promptHtml]);
  const expected = useMemo(() => stripHtml(back), [back]);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the input focused so it owns Enter on every fresh card.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  const correct = normalizeAnswer(typed) === normalizeAnswer(expected);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // First Enter reveals; once revealed, Enter is the "Bom" (good) shortcut.
      if (!revealed) onReveal();
      else onResolve('good');
      return;
    }
    // After revealing, 1-4 grade the card manually.
    if (revealed) {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        onResolve(KEY_RATINGS[n - 1]);
      }
    }
  }

  return (
    <div className="flip-scene w-full max-w-2xl">
      <div className="cloze-card" style={{ minHeight: height }}>
        {/* Corner: the prompt (front) audio, else the front-text TTS. */}
        {(hasFrontAudio || audioEnabled) && (
          <div className="absolute top-3 right-3">
            {hasFrontAudio ? (
              <PlayAudioButton onPlay={onReplayFrontAudio} />
            ) : (
              <SpeakerButton text={promptText} lang={ttsLang} size={18} onLight />
            )}
          </div>
        )}
        <div className="w-full max-w-xl">
          <CardHtml html={promptHtml} className="card-content" audioEnabled={audioEnabled} />

          <input
            ref={inputRef}
            value={typed}
            readOnly={revealed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onKeyDown}
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
                <div className={cn('typein-result', correct ? 'typein-ok' : 'typein-bad')}>
                  {correct ? <Check size={16} /> : <X size={16} />}
                  <span>{correct ? 'Correto!' : 'Resposta esperada:'}</span>
                </div>
                <p className="typein-expected">{expected}</p>
                {hasBackAudio && (
                  <div className="flex justify-center mt-1 mb-2">
                    <PlayAudioButton onPlay={onReplayBackAudio} />
                  </div>
                )}
                {!correct && typed.trim() && (
                  <p className="typein-yours">
                    Você digitou: <span>{typed}</span>
                  </p>
                )}
                <p className="typein-hint">Enter = Bom · 1-4 para avaliar</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
