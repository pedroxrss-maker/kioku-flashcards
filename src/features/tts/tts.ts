/**
 * Text-to-speech service. v1 uses the browser Web Speech API (no key). The
 * `TtsService` interface lets a cloud provider (Google, via Worker) be plugged
 * in later for higher-quality voices.
 */

export interface SpeakOptions {
  lang?: string;
  voiceURI?: string | null;
  rate?: number; // 0.5 – 1.5
}

export interface TtsService {
  readonly supported: boolean;
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  stop(): void;
  getVoices(): SpeechSynthesisVoice[];
  /** Resolves once the platform voice list is populated. */
  ready(): Promise<SpeechSynthesisVoice[]>;
}

class WebSpeechTts implements TtsService {
  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.supported ? window.speechSynthesis.getVoices() : [];
  }

  ready(): Promise<SpeechSynthesisVoice[]> {
    if (!this.supported) return Promise.resolve([]);
    const existing = this.getVoices();
    if (existing.length) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const handler = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
        resolve(this.getVoices());
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);
      // Fallback in case the event never fires.
      setTimeout(() => resolve(this.getVoices()), 1000);
    });
  }

  stop(): void {
    if (this.supported) window.speechSynthesis.cancel();
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      if (!this.supported || !text.trim()) {
        resolve();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      if (opts.lang) u.lang = opts.lang;
      if (opts.rate) u.rate = Math.min(1.5, Math.max(0.5, opts.rate));
      const voice = this.pickVoice(opts);
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }

  private pickVoice(opts: SpeakOptions): SpeechSynthesisVoice | null {
    const voices = this.getVoices();
    if (!voices.length) return null;
    if (opts.voiceURI) {
      const exact = voices.find((v) => v.voiceURI === opts.voiceURI);
      if (exact) return exact;
    }
    if (opts.lang) {
      const base = opts.lang.split('-')[0].toLowerCase();
      return (
        voices.find((v) => v.lang.toLowerCase() === opts.lang!.toLowerCase()) ??
        voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
        null
      );
    }
    return null;
  }
}

export const tts: TtsService = new WebSpeechTts();
