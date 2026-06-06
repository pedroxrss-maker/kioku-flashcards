// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Back the repository (decks/cards/settings) with the in-memory fake supabase
// client; media still rides on IndexedDB (fake-indexeddb above).
vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../../test/fakeSupabase');
  return { supabase: createFakeSupabase(), isSupabaseConfigured: true };
});

import { ElevenLabsProvider } from './providers';
import { resolveMediaHtml, storeAudio } from '../media/media';
import { repo } from '../../db/repositories';

// jsdom doesn't implement object URLs — stub them.
URL.createObjectURL = vi.fn(() => 'blob:mock-audio');
URL.revokeObjectURL = vi.fn();

afterEach(() => vi.unstubAllGlobals());

describe('ElevenLabs generate-and-store', () => {
  it('synthesizes, stores the MP3, and resolves to a playable kioku-audio:// URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(32),
      })) as unknown as typeof fetch,
    );

    const blob = await new ElevenLabsProvider('k').synthesize('hello', {
      voiceId: 'v',
      modelId: 'eleven_multilingual_v2',
    });
    const { id } = await storeAudio(blob);

    // Stored blob exists and the ref resolves to an object URL for <audio>.
    expect(await repo.getMedia(id)).toBeTruthy();
    const html = await resolveMediaHtml(`<audio src="kioku-audio://${id}" controls></audio>`);
    expect(html).toContain('blob:mock-audio');
  });

  it('round-trips a card carrying an ElevenLabs audio chip through the repository', async () => {
    const { id } = await storeAudio(new Blob([new ArrayBuffer(8)], { type: 'audio/mpeg' }));
    const front =
      `Olá <span class="kioku-audio-chip"><audio controls src="kioku-audio://${id}"></audio></span>`;

    const created = await repo.createCard({ deckId: 'deck-x', front, back: '' });
    const reloaded = await repo.getCard(created.id);

    expect(reloaded?.front).toContain(`kioku-audio://${id}`);
    expect(await repo.getMedia(id)).toBeTruthy();
  });

  it('reads the API key from settings (not hardcoded) and sends it', async () => {
    const base = await repo.getSettings();
    await repo.saveSettings({ tts: { ...base.tts, elevenLabsApiKey: 'from-settings' } });
    const s = await repo.getSettings();
    expect(s.tts.elevenLabsApiKey).toBe('from-settings');

    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(4),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchFn);

    await new ElevenLabsProvider(s.tts.elevenLabsApiKey).synthesize('x', {
      voiceId: 'v',
      modelId: 'm',
    });
    const init = (fetchFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('from-settings');
  });
});
