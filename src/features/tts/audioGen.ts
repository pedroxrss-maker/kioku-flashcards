/**
 * ElevenLabs audio generation that lands in Supabase Storage. Synthesize the
 * card text to MP3, upload it to "{user_id}/{deck_id}/{card_id}.mp3", then set
 * cards.audio_path so review can play it offline (via a signed URL). Per-card
 * and per-deck (batch) helpers live here.
 */
import { repo } from '../../db/repositories';
import { stripHtml } from '../../lib/text';
import { mediaObjectPath, uploadMedia } from '../media/storage';
import { DEFAULT_ELEVEN_MODEL, ElevenLabsProvider, TtsProviderError } from './providers';
import type { AppSettings, Card } from '../../db/types';

export type AudioSide = 'front' | 'back';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cardText(card: Card, side: AudioSide): string {
  return stripHtml(side === 'front' ? card.front : card.back).trim();
}

/** Synthesize one card's text, upload the mp3, and persist cards.audio_path. */
export async function generateAndStoreCardAudio(
  card: Card,
  settings: AppSettings,
  side: AudioSide = 'front',
): Promise<{ path: string; bytes: number }> {
  const key = settings.tts.elevenLabsApiKey?.trim();
  if (!key) throw new TtsProviderError('Configure a chave da ElevenLabs nas Configurações.');
  const voiceId = settings.tts.elevenLabsVoiceId?.trim();
  if (!voiceId) {
    throw new TtsProviderError('Escolha uma voz padrão da ElevenLabs nas Configurações.');
  }
  const text = cardText(card, side);
  if (!text) throw new TtsProviderError('Este card não tem texto para gerar áudio.');

  const blob = await new ElevenLabsProvider(key).synthesize(text, {
    voiceId,
    modelId: settings.tts.elevenLabsModel || DEFAULT_ELEVEN_MODEL,
  });
  const path = await mediaObjectPath(card.deckId, `${card.id}.mp3`);
  await uploadMedia(path, blob, 'audio/mpeg');
  await repo.updateCard(card.id, { audioPath: path });
  return { path, bytes: blob.size };
}

export interface DeckAudioProgress {
  done: number;
  total: number;
}
export interface DeckAudioResult {
  total: number; // cards that needed audio
  ok: number;
  failed: number;
  skipped: number; // already had audio or had no text
  bytes: number;
  quotaHit: boolean;
}

/**
 * Generate audio for every card in a deck that has no audio yet. Sequential to
 * respect ElevenLabs rate limits; a single card's failure does not abort the
 * batch, but a quota/429 (which would hit every remaining card) stops it early.
 */
export async function generateDeckAudio(
  deckId: string,
  settings: AppSettings,
  onProgress: (p: DeckAudioProgress) => void,
  side: AudioSide = 'front',
): Promise<DeckAudioResult> {
  const cards = await repo.listCards(deckId);
  const targets = cards.filter((c) => !c.audioPath && cardText(c, side).length > 0);
  const total = targets.length;
  let ok = 0;
  let failed = 0;
  let bytes = 0;
  let quotaHit = false;

  for (let i = 0; i < targets.length; i += 1) {
    try {
      const r = await generateAndStoreCardAudio(targets[i], settings, side);
      ok += 1;
      bytes += r.bytes;
    } catch (e) {
      failed += 1;
      if (e instanceof TtsProviderError && /cota|quota|429|esgotad/i.test(e.message)) {
        quotaHit = true;
        onProgress({ done: i + 1, total });
        break;
      }
    }
    onProgress({ done: i + 1, total });
    await delay(250); // gentle on rate limits
  }

  return { total, ok, failed, skipped: cards.length - total, bytes, quotaHit };
}
