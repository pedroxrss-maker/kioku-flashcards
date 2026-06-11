import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTtsConfigured, listGoogleVoices, synthesizeGoogle } from './googleProvider';
import { TtsProviderError } from './providers';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('googleProvider', () => {
  it('lists curated en-US and pt-BR voices', () => {
    const voices = listGoogleVoices();
    expect(voices.some((v) => v.lang === 'en-US')).toBe(true);
    expect(voices.some((v) => v.lang === 'pt-BR')).toBe(true);
    expect(voices.every((v) => v.id.length > 0 && v.name.length > 0)).toBe(true);
  });

  it('is "not configured" and throws a pt-BR error when no proxy URL is set', async () => {
    vi.stubEnv('VITE_TTS_PROXY_URL', '');
    expect(isTtsConfigured()).toBe(false);
    await expect(
      synthesizeGoogle('olá', { voiceName: 'pt-BR-Neural2-B', languageCode: 'pt-BR' }),
    ).rejects.toBeInstanceOf(TtsProviderError);
  });

  it('posts to {base}/synthesize and decodes audioContent into an audio/mpeg blob', async () => {
    vi.stubEnv('VITE_TTS_PROXY_URL', 'https://tts.example.dev/');
    const audioContent = btoa('ID3-fake-mp3-bytes');
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ audioContent }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchFn);

    const blob = await synthesizeGoogle('hello', {
      voiceName: 'en-US-Neural2-D',
      languageCode: 'en-US',
    });
    expect(blob.type).toBe('audio/mpeg');
    expect(await blob.text()).toBe('ID3-fake-mp3-bytes');

    const [url, init] = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe('https://tts.example.dev/synthesize');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      text: 'hello',
      voiceName: 'en-US-Neural2-D',
      languageCode: 'en-US',
      audioEncoding: 'MP3',
    });
  });
});
