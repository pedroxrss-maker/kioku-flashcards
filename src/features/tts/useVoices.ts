import { useEffect, useState } from 'react';
import { tts } from './tts';

/** Reactively returns the platform's available speech-synthesis voices. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    tts.getVoices(),
  );

  useEffect(() => {
    let alive = true;
    tts.ready().then((v) => {
      if (alive) setVoices(v);
    });

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const handler = () => setVoices(tts.getVoices());
      window.speechSynthesis.addEventListener('voiceschanged', handler);
      return () => {
        alive = false;
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
      };
    }
    return () => {
      alive = false;
    };
  }, []);

  return voices;
}
