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
  /** Maximum card height in px. When set (mobile), the card never grows past it;
   *  instead an over-tall face is zoomed down to fit, so the AI helper buttons
   *  under the card never collide with the grade buttons below. */
  maxHeight?: number;
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
  height = 'var(--review-card-min)',
  maxHeight,
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
  // When the card is height-capped (mobile), an over-tall face is zoomed down to
  // fit instead of letting the card grow into the buttons below. 1 = no zoom.
  const [frontScale, setFrontScale] = useState(1);
  const [backScale, setBackScale] = useState(1);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // The card height is the TALLER of the two faces, so it stays constant through
  // the flip: revealing the back (and the AI buttons that appear under it) never
  // resizes the card. The card only grows when a card's own content (more text or
  // an image) needs more room, and that growth animates smoothly (height
  // transition in CSS). ResizeObserver re-measures when content (e.g. an image)
  // resizes. Both faces are absolutely positioned, so both measure regardless of
  // which side is showing.
  useLayoutEffect(() => {
    const facePad = (el: HTMLDivElement | null): number => {
      const face = el?.parentElement;
      if (!face) return 0;
      const cs = getComputedStyle(face);
      return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    };
    const measure = () => {
      // offsetHeight is the NATURAL content height — a CSS transform (the zoom we
      // may apply below) never changes it, so measuring stays free of feedback.
      const pad = facePad(frontRef.current ?? backRef.current);
      const cFront = frontRef.current?.offsetHeight ?? 0;
      const cBack = backRef.current?.offsetHeight ?? 0;
      const h = Math.max(cFront + pad, cBack + pad);
      if (h > 0) setInnerH(Math.ceil(h)); // 0 in non-layout envs (jsdom): keep min
      // Cap + zoom (mobile): the card stays at `maxHeight` and each over-tall face
      // shrinks uniformly so its answer — and any image — still fits inside it.
      if (maxHeight != null && h > 0) {
        const avail = Math.max(0, Math.min(h, maxHeight) - pad);
        setFrontScale(cFront > avail && cFront > 0 ? avail / cFront : 1);
        setBackScale(cBack > avail && cBack > 0 ? avail / cBack : 1);
      } else {
        setFrontScale(1);
        setBackScale(1);
      }
    };
    measure();
    // ResizeObserver is absent in some test environments; the one-shot measure
    // above is enough there, the observer just keeps it live as images load.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [front, back, maxHeight]);

  const audioBtn = (onReplay?: () => void) => <PlayAudioButton onPlay={onReplay} />;

  // With a cap set, the card height is clamped to it (zoom handles the overflow);
  // otherwise it tracks content and grows up to 82vh as before.
  const capped = maxHeight != null && innerH != null && innerH > maxHeight;
  const cardHeight =
    innerH != null && maxHeight != null ? Math.min(innerH, maxHeight) : innerH ?? undefined;

  return (
    <div className="flip-scene w-full max-w-2xl">
      <div
        onClick={onFlip}
        className={cn(
          'flip-inner w-full cursor-pointer',
          !animate && 'no-flip-anim',
          flipped && 'is-flipped',
        )}
        style={{
          height: cardHeight,
          minHeight: capped ? maxHeight : height,
          maxHeight: maxHeight != null ? maxHeight : '82vh',
        }}
      >
        {/* The top-right corner plays the front's own audio track, on both faces
            (shown only when the front actually has a track). */}
        {/* Front face */}
        <div className="review-face flip-face" style={frontScale < 1 ? { overflow: 'hidden' } : undefined}>
          {hasFrontAudio && (
            <div className="absolute top-3 right-3 z-10">{audioBtn(onReplayFrontAudio)}</div>
          )}
          <div
            ref={frontRef}
            className="w-full shrink-0"
            style={frontScale < 1 ? { transform: `scale(${frontScale})`, transformOrigin: 'top center' } : undefined}
          >
            <CardHtml html={front} className="card-content" audioEnabled={audioEnabled && !hasFrontAudio} />
          </div>
        </div>
        {/* Back face: corner stays the FRONT audio; a dedicated button on the
            right under the divider plays the BACK audio, only when there is one. */}
        <div className="review-face flip-face flip-face-back" style={backScale < 1 ? { overflow: 'hidden' } : undefined}>
          {hasFrontAudio && (
            <div className="absolute top-3 right-3 z-10">{audioBtn(onReplayFrontAudio)}</div>
          )}
          <div
            ref={backRef}
            className="w-full max-w-xl shrink-0"
            style={backScale < 1 ? { transform: `scale(${backScale})`, transformOrigin: 'top center' } : undefined}
          >
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
