import { useEffect, useState } from 'react';
import { CardHtml } from '../media/CardHtml';
import { SpeakerButton } from '../tts/SpeakerButton';
import { stripHtml } from '../../lib/text';
import { cn } from '../../lib/cn';

interface FlipCardProps {
  front: string;
  back: string;
  ttsLang: string;
  flipped: boolean;
  onFlip: () => void;
  height?: string;
  /** When false, no speaker icon and attached audio is hidden. */
  audioEnabled?: boolean;
}

/**
 * The review flip card. Keyed by the current card upstream so it fully remounts
 * on every card change, always starting on the front. The rotateY transition is
 * disabled on mount and enabled only after first paint, so an incoming card
 * never animates from its back face — only user-initiated flips animate.
 */
export function FlipCard({
  front,
  back,
  ttsLang,
  flipped,
  onFlip,
  height = 'clamp(280px, 46vh, 440px)',
  audioEnabled = true,
}: FlipCardProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flip-scene w-full max-w-2xl">
      <div
        onClick={onFlip}
        className={cn(
          'flip-inner w-full cursor-pointer',
          !animate && 'no-flip-anim',
          flipped && 'is-flipped',
        )}
        style={{ height }}
      >
        {/* Front face */}
        <div className="review-face flip-face">
          {audioEnabled && (
            <div className="absolute top-3 right-3">
              <SpeakerButton text={stripHtml(front)} lang={ttsLang} size={18} onLight />
            </div>
          )}
          <CardHtml html={front} className="card-content" audioEnabled={audioEnabled} />
        </div>
        {/* Back face */}
        <div className="review-face flip-face flip-face-back">
          {audioEnabled && (
            <div className="absolute top-3 right-3 flex gap-2">
              <SpeakerButton text={stripHtml(back)} lang={ttsLang} size={18} onLight />
            </div>
          )}
          <div className="w-full max-w-xl">
            <CardHtml html={front} className="card-content-sm" audioEnabled={audioEnabled} />
            <div className="my-4 h-px w-full" style={{ background: '#0f0f0f22' }} />
            <CardHtml html={back} className="card-content" audioEnabled={audioEnabled} />
          </div>
        </div>
      </div>
    </div>
  );
}
