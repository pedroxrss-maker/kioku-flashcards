import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CardHtml } from '../media/CardHtml';
import { SpeakerButton } from '../tts/SpeakerButton';
import { buildClozeHtml, clozePlainText } from '../../lib/cloze';
import { stripHtml } from '../../lib/text';
import { cn } from '../../lib/cn';

interface ClozeCardProps {
  front: string;
  back: string;
  ttsLang: string;
  /** Whether the answer is revealed (the hidden word fades in). */
  revealed: boolean;
  onReveal: () => void;
  height?: string;
  audioEnabled?: boolean;
}

/**
 * Cloze review card. Unlike FlipCard it never flips: the hidden word fades in
 * place when revealed and the back's extra content slides in smoothly below, all
 * on the same face.
 */
export function ClozeCard({
  front,
  back,
  ttsLang,
  revealed,
  onReveal,
  height = 'clamp(280px, 46vh, 440px)',
  audioEnabled = true,
}: ClozeCardProps) {
  const html = useMemo(() => buildClozeHtml(front), [front]);
  const hasBack = !!stripHtml(back);

  return (
    <div className="flip-scene w-full max-w-2xl">
      <div
        onClick={onReveal}
        className={cn('cloze-card cursor-pointer', revealed && 'cloze-revealed')}
        style={{ minHeight: height }}
      >
        {audioEnabled && (
          <div className="absolute top-3 right-3">
            <SpeakerButton text={clozePlainText(front)} lang={ttsLang} size={18} onLight />
          </div>
        )}
        <div className="w-full max-w-xl">
          <CardHtml html={html} className="card-content" audioEnabled={audioEnabled} />
          <AnimatePresence initial={false}>
            {revealed && hasBack && (
              <motion.div
                key="cloze-back"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div className="my-4 h-px w-full" style={{ background: '#0f0f0f22' }} />
                <CardHtml html={back} className="card-content-sm" audioEnabled={audioEnabled} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
