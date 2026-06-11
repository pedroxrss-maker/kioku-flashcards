import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
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
  /** The front has an explicitly attached/stored audio (plays regardless of the
   *  deck TTS toggle). Shows a replay speaker button instead of the TTS one. */
  hasFrontAudio?: boolean;
  /** Replay the attached front audio from the start. */
  onReplayFrontAudio?: () => void;
}

/**
 * The review flip card. Keyed by the current card upstream so it fully remounts
 * on every card change, always starting on the front. The rotateY transition is
 * disabled on mount and enabled only after first paint, so an incoming card
 * never animates from its back face, only user-initiated flips animate.
 */
export function FlipCard({
  front,
  back,
  ttsLang,
  flipped,
  onFlip,
  height = 'clamp(280px, 46vh, 440px)',
  audioEnabled = true,
  hasFrontAudio = false,
  onReplayFrontAudio,
}: FlipCardProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // The attached-audio replay control (top-right). Always available when the
  // card has front audio, even if the deck's TTS pronunciation is off.
  const frontAudioBtn = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onReplayFrontAudio?.();
      }}
      onMouseDown={(e) => e.preventDefault()}
      title="Ouvir áudio"
      aria-label="Ouvir áudio"
      className="text-black/45 hover:text-black transition-colors"
    >
      <Volume2 size={18} />
    </button>
  );

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
          {(hasFrontAudio || audioEnabled) && (
            <div className="absolute top-3 right-3">
              {hasFrontAudio ? (
                frontAudioBtn
              ) : (
                <SpeakerButton text={stripHtml(front)} lang={ttsLang} size={18} onLight />
              )}
            </div>
          )}
          <CardHtml html={front} className="card-content" audioEnabled={audioEnabled && !hasFrontAudio} />
        </div>
        {/* Back face */}
        <div className="review-face flip-face flip-face-back">
          {audioEnabled && (
            <div className="absolute top-3 right-3 flex gap-2">
              <SpeakerButton text={stripHtml(back)} lang={ttsLang} size={18} onLight />
            </div>
          )}
          <div className="w-full max-w-xl">
            <CardHtml html={front} className="card-content-sm" audioEnabled={audioEnabled && !hasFrontAudio} />
            <div className="my-4 h-px w-full" style={{ background: '#0f0f0f22' }} />
            <CardHtml html={back} className="card-content" audioEnabled={audioEnabled} />
          </div>
        </div>
      </div>
    </div>
  );
}
