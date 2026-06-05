import { useState } from 'react';
import type { MouseEvent } from 'react';
import { Volume2 } from 'lucide-react';
import { tts } from './tts';
import { useSettings } from '../../db/hooks';
import { cn } from '../../lib/cn';

interface SpeakerButtonProps {
  text: string;
  lang: string;
  size?: number;
  /** Override the global rate. */
  rate?: number;
  /** Use dark-on-light colors (for white surfaces like the review card). */
  onLight?: boolean;
  className?: string;
}

/** Click to pronounce `text` in `lang`. Hidden when TTS is unsupported/off. */
export function SpeakerButton({
  text,
  lang,
  size = 15,
  rate,
  onLight,
  className,
}: SpeakerButtonProps) {
  const settings = useSettings();
  const [speaking, setSpeaking] = useState(false);

  if (!tts.supported || !text.trim()) return null;
  if (settings && !settings.tts.enabled) return null;

  async function onClick(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (speaking) {
      tts.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    await tts.speak(text, {
      lang,
      voiceURI: settings?.tts.voiceURI ?? null,
      rate: rate ?? settings?.tts.rate ?? 1,
    });
    setSpeaking(false);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      title="Ouvir pronúncia"
      aria-label="Ouvir pronúncia"
      className={cn(
        'transition-colors',
        speaking
          ? 'text-accent'
          : onLight
            ? 'text-black/45 hover:text-black'
            : 'text-muted hover:text-fg',
        className,
      )}
    >
      <Volume2 size={size} />
    </button>
  );
}
