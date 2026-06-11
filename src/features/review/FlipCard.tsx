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
  /** The front face has its own audio track (attached chip or generated for the
   *  front). Shows a replay speaker button on the front instead of the TTS one. */
  hasFrontAudio?: boolean;
  /** Replay the front face audio from the start. */
  onReplayFrontAudio?: () => void;
  /** The back face has its own audio track (attached chip or generated for the
   *  back). Shows a replay speaker button on the back. */
  hasBackAudio?: boolean;
  /** Replay the back face audio from the start. */
  onReplayBackAudio?: () => void;
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
  hasBackAudio = false,
  onReplayBackAudio,
}: FlipCardProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // The per-face audio replay control (top-right): an orange circle that plays
  // THAT face's track, available even if the deck's TTS pronunciation is off.
  const audioBtn = (onReplay?: () => void) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onReplay?.();
      }}
      onMouseDown={(e) => e.preventDefault()}
      title="Ouvir áudio"
      aria-label="Ouvir áudio"
      className="inline-flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
      style={{
        width: 36,
        height: 36,
        background: 'var(--accent)',
        color: '#fff',
        boxShadow: '0 2px 8px color-mix(in srgb, var(--accent) 40%, transparent)',
      }}
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
        {/* Front face: front audio button, else the front-text TTS. */}
        <div className="review-face flip-face">
          {(hasFrontAudio || audioEnabled) && (
            <div className="absolute top-3 right-3">
              {hasFrontAudio ? (
                audioBtn(onReplayFrontAudio)
              ) : (
                <SpeakerButton text={stripHtml(front)} lang={ttsLang} size={18} onLight />
              )}
            </div>
          )}
          <CardHtml html={front} className="card-content" audioEnabled={audioEnabled && !hasFrontAudio} />
        </div>
        {/* Back face: back audio button, else the back-text TTS. */}
        <div className="review-face flip-face flip-face-back">
          {(hasBackAudio || audioEnabled) && (
            <div className="absolute top-3 right-3">
              {hasBackAudio ? (
                audioBtn(onReplayBackAudio)
              ) : (
                <SpeakerButton text={stripHtml(back)} lang={ttsLang} size={18} onLight />
              )}
            </div>
          )}
          <div className="w-full max-w-xl">
            <CardHtml html={front} className="card-content-sm" audioEnabled={audioEnabled && !hasFrontAudio} />
            <div className="my-4 h-px w-full" style={{ background: '#0f0f0f22' }} />
            <CardHtml html={back} className="card-content" audioEnabled={audioEnabled && !hasBackAudio} />
          </div>
        </div>
      </div>
    </div>
  );
}
