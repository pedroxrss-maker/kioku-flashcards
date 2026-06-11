import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CardHtml } from '../media/CardHtml';
import { PlayAudioButton } from './PlayAudioButton';
import { cn } from '../../lib/cn';

interface FlipCardProps {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
  /** Minimum card height. The card grows beyond this to fit its content. */
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
 *
 * The card height tracks the VISIBLE face's content (measured via refs +
 * ResizeObserver, so it also reacts to images loading) and grows above the
 * minimum, animating the change as a smooth vertical slide. Nothing is clipped.
 */
export function FlipCard({
  front,
  back,
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
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [innerH, setInnerH] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Grow the card to fit the visible face's content (front when showing, back
  // when flipped), so the divider, buttons, text and any image all fit without
  // clipping. ResizeObserver re-measures when content (e.g. an image) resizes.
  useLayoutEffect(() => {
    const measure = () => {
      const el = flipped ? backRef.current : frontRef.current;
      if (!el) return;
      const face = el.parentElement;
      let pad = 0;
      if (face) {
        const cs = getComputedStyle(face);
        pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      }
      const h = el.offsetHeight + pad;
      if (h > 0) setInnerH(Math.ceil(h)); // 0 in non-layout envs (jsdom): keep min
    };
    measure();
    // ResizeObserver is absent in some test environments; the one-shot measure
    // above is enough there, the observer just keeps it live as images load.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [flipped, front, back]);

  const audioBtn = (onReplay?: () => void) => <PlayAudioButton onPlay={onReplay} />;

  return (
    <div className="flip-scene w-full max-w-2xl">
      <div
        onClick={onFlip}
        className={cn(
          'flip-inner w-full cursor-pointer',
          !animate && 'no-flip-anim',
          flipped && 'is-flipped',
        )}
        style={{ height: innerH ?? undefined, minHeight: height, maxHeight: '82vh' }}
      >
        {/* The top-right corner plays the front's own audio track, on both faces
            (shown only when the front actually has a track). */}
        {/* Front face */}
        <div className="review-face flip-face">
          {hasFrontAudio && (
            <div className="absolute top-3 right-3 z-10">{audioBtn(onReplayFrontAudio)}</div>
          )}
          <div ref={frontRef} className="w-full shrink-0">
            <CardHtml html={front} className="card-content" audioEnabled={audioEnabled && !hasFrontAudio} />
          </div>
        </div>
        {/* Back face: corner stays the FRONT audio; a dedicated button on the
            right under the divider plays the BACK audio, only when there is one. */}
        <div className="review-face flip-face flip-face-back">
          {hasFrontAudio && (
            <div className="absolute top-3 right-3 z-10">{audioBtn(onReplayFrontAudio)}</div>
          )}
          <div ref={backRef} className="w-full max-w-xl shrink-0">
            <CardHtml html={front} className="card-content-sm" audioEnabled={audioEnabled && !hasFrontAudio} />
            <div className="my-4 h-px w-full" style={{ background: '#0f0f0f22' }} />
            {hasBackAudio && (
              <div className="flex justify-end mb-3">{audioBtn(onReplayBackAudio)}</div>
            )}
            <CardHtml html={back} className="card-content" audioEnabled={audioEnabled && !hasBackAudio} />
          </div>
        </div>
      </div>
    </div>
  );
}
