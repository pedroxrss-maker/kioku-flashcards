import type { CSSProperties } from 'react';
import type { ButtonCount, Rating } from '../../db/types';
import type { RatingPreview } from '../scheduling';
import { buttonsFor } from './buttons';

interface AnswerButtonsProps {
  buttonCount: ButtonCount;
  preview: Record<Rating, RatingPreview>;
  onRate: (rating: Rating) => void;
}

/** The configurable answer-button row, each showing its interval preview. */
export function AnswerButtons({ buttonCount, preview, onRate }: AnswerButtonsProps) {
  const defs = buttonsFor(buttonCount);
  return (
    <div className="flex gap-2 md:gap-3 w-full">
      {defs.map((b, i) => (
        <button
          key={`${b.rating}-${i}`}
          type="button"
          className="answer-btn"
          style={{ '--btn-color': b.color, '--btn-text': b.text } as CSSProperties}
          onClick={() => onRate(b.rating)}
        >
          <span className="answer-key">{i + 1}</span>
          <span className="answer-label">{b.label}</span>
          <span className="answer-int">{preview[b.rating].intervalLabel}</span>
        </button>
      ))}
    </div>
  );
}
