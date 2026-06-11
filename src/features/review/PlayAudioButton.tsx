import { Volume2 } from 'lucide-react';

/**
 * The orange circular play button for a card face's attached/generated audio.
 * Shared by FlipCard, ClozeCard and TypeInCard so every card type plays audio
 * the same way. Stops propagation so it never flips/reveals the card.
 */
export function PlayAudioButton({ onPlay, size = 18 }: { onPlay?: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onPlay?.();
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
      <Volume2 size={size} />
    </button>
  );
}
