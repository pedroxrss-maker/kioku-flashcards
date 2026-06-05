/**
 * Cloud TTS provider abstraction. ElevenLabs is generate-and-store: synthesize
 * an MP3 once via the API, then the Blob is saved to the media store and played
 * offline at review time (no key needed). A future server-side proxy is a
 * one-line `baseUrl` swap.
 */

export interface SynthesizeParams {
  voiceId: string;
  modelId: string;
  languageCode?: string; // ISO 639-1, optional
}

export interface TtsVoice {
  id: string;
  name: string;
  lang?: string;
}

export interface TtsProvider {
  synthesize(text: string, params: SynthesizeParams): Promise<Blob>;
  listVoices(): Promise<TtsVoice[]>;
}

/** Carries a user-facing (pt-BR) message; safe to surface in dialogs. */
export class TtsProviderError extends Error {}

export interface ModelOption {
  id: string;
  label: string;
}

export const ELEVEN_MODELS: ModelOption[] = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 — alta qualidade' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 — rápido e econômico' },
  { id: 'eleven_v3', label: 'v3 — mais expressivo' },
];

export const DEFAULT_ELEVEN_MODEL = 'eleven_multilingual_v2';
const ELEVEN_BASE = 'https://api.elevenlabs.io';

function mapStatus(status: number): TtsProviderError {
  switch (status) {
    case 401:
      return new TtsProviderError('Chave de API inválida');
    case 422:
      return new TtsProviderError('Idioma não suportado por este modelo');
    case 429:
      return new TtsProviderError('Cota da ElevenLabs esgotada');
    default:
      return new TtsProviderError(`Erro da ElevenLabs (HTTP ${status})`);
  }
}

const CONNECTION_ERROR =
  'Falha de conexão com a ElevenLabs (possível CORS; pode exigir um proxy)';

export class ElevenLabsProvider implements TtsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = ELEVEN_BASE,
  ) {}

  async synthesize(text: string, params: SynthesizeParams): Promise<Blob> {
    const url = `${this.baseUrl}/v1/text-to-speech/${params.voiceId}?output_format=mp3_44100_128`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: params.modelId,
          ...(params.languageCode ? { language_code: params.languageCode } : {}),
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
    } catch {
      throw new TtsProviderError(CONNECTION_ERROR);
    }
    if (!res.ok) throw mapStatus(res.status);
    const buf = await res.arrayBuffer();
    return new Blob([buf], { type: 'audio/mpeg' });
  }

  async listVoices(): Promise<TtsVoice[]> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/voices`, {
        headers: { 'xi-api-key': this.apiKey },
      });
    } catch {
      throw new TtsProviderError(CONNECTION_ERROR);
    }
    if (!res.ok) throw mapStatus(res.status);
    const data = (await res.json()) as {
      voices?: Array<{
        voice_id: string;
        name: string;
        labels?: { language?: string };
        fine_tuning?: { language?: string };
      }>;
    };
    return (data.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      lang: v.labels?.language ?? v.fine_tuning?.language,
    }));
  }
}
