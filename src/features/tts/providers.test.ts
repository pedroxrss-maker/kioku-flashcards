import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsProvider } from './providers';

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => impl(url, init) as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('ElevenLabsProvider.synthesize', () => {
  it('returns an audio/mpeg Blob and sends the key + body from arguments', async () => {
    const fetchFn = mockFetch(() => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(16),
    }));

    const blob = await new ElevenLabsProvider('settings-key').synthesize('olá', {
      voiceId: 'voice-1',
      modelId: 'eleven_multilingual_v2',
      languageCode: 'pt',
    });

    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBe(16);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('/v1/text-to-speech/voice-1');
    expect(url).toContain('output_format=mp3_44100_128');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe('settings-key'); // key from arg (settings), not code
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model_id).toBe('eleven_multilingual_v2');
    expect(body.language_code).toBe('pt');
    expect(body.voice_settings).toEqual({ stability: 0.5, similarity_boost: 0.75 });
  });

  it('maps HTTP 401 to a friendly message', async () => {
    mockFetch(() => ({ ok: false, status: 401 }));
    await expect(
      new ElevenLabsProvider('bad').synthesize('x', { voiceId: 'v', modelId: 'm' }),
    ).rejects.toThrow('Chave de API inválida');
  });

  it('maps a network/CORS failure to a connection message', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      new ElevenLabsProvider('k').synthesize('x', { voiceId: 'v', modelId: 'm' }),
    ).rejects.toThrow(/Falha de conexão com a ElevenLabs/);
  });
});

describe('ElevenLabsProvider.listVoices', () => {
  it('maps the API voices to {id,name,lang}', async () => {
    mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({
        voices: [{ voice_id: 'v1', name: 'Rachel', labels: { language: 'en' } }],
      }),
    }));
    const voices = await new ElevenLabsProvider('k').listVoices();
    expect(voices).toEqual([{ id: 'v1', name: 'Rachel', lang: 'en' }]);
  });
});
