/**
 * Geração de áudio que termina no Supabase Storage. Sintetiza o texto do card
 * para MP3, envia para "{user_id}/{deck_id}/{card_id}.mp3" e grava
 * cards.audio_path para a revisão tocar offline (via URL assinada). Helpers por
 * card e por deck (em lote) vivem aqui. O provedor concreto (Google, via Worker)
 * produz os bytes; este módulo é agnóstico de provedor.
 */
import { repo } from '../../db/repositories';
import { stripHtml } from '../../lib/text';
import { mediaObjectPath, uploadMedia } from '../media/storage';
import { stripAudioHtml } from '../media/media';
import { TtsProviderError } from './providers';
import { synthesizeGoogle } from './googleProvider';
import type { AppSettings, Card } from '../../db/types';

export type AudioSide = 'front' | 'back';

/** Voz/idioma escolhidos para esta geração (sobrepõe o padrão das Configurações). */
export interface VoiceChoice {
  voiceName: string;
  languageCode: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Texto a falar de um card. Remove primeiro os chips de áudio anexado (e tokens
 * [sound:...]) para a TTS NUNCA ler o nome do arquivo de áudio (ex.: "04 - ...
 * .mp3"); só o texto de verdade do card é sintetizado.
 */
function cardText(card: Card, side: AudioSide): string {
  const html = side === 'front' ? card.front : card.back;
  return stripHtml(stripAudioHtml(html)).trim();
}

/**
 * Já tem áudio para este lado? Conta tanto o áudio gerado (cards.audio_path)
 * quanto um áudio ANEXADO pelo usuário (chip kioku-audio:// no HTML do lado).
 * Usado para NUNCA sobrescrever um áudio que já existe.
 */
export function cardHasAudio(card: Card, side: AudioSide): boolean {
  if (card.audioPath) return true;
  const html = side === 'front' ? card.front : card.back;
  return html.includes('kioku-audio://');
}

/** Sintetiza o texto de um card, envia o MP3 e persiste cards.audio_path. */
export async function generateAndStoreCardAudio(
  card: Card,
  settings: AppSettings,
  side: AudioSide = 'front',
  voice?: VoiceChoice,
): Promise<{ path: string; bytes: number }> {
  const voiceName = (voice?.voiceName ?? settings.tts.googleVoiceName)?.trim();
  if (!voiceName) {
    throw new TtsProviderError('Escolha uma voz do Google nas Configurações.');
  }
  const languageCode = (voice?.languageCode ?? settings.tts.googleLanguageCode)?.trim() || 'en-US';
  const text = cardText(card, side);
  if (!text) throw new TtsProviderError('Este card não tem texto para gerar áudio.');

  const blob = await synthesizeGoogle(text, { voiceName, languageCode, audioEncoding: 'MP3' });
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
  total: number; // cards que precisavam de áudio
  ok: number;
  failed: number;
  skipped: number; // já tinham áudio ou não tinham texto
  bytes: number;
  stopped: boolean; // um erro que atingiria todos os cards interrompeu o lote
}

/**
 * Gera áudio para todo card do deck que ainda não tem áudio (gerado OU anexado),
 * NUNCA sobrescrevendo o que já existe. Sequencial para ser gentil com limites de
 * taxa; a falha de um card não aborta o lote, mas um erro que atingiria todos os
 * cards (ex.: Worker não configurado, cota esgotada) interrompe cedo.
 */
export async function generateDeckAudio(
  deckId: string,
  settings: AppSettings,
  onProgress: (p: DeckAudioProgress) => void,
  side: AudioSide = 'front',
  voice?: VoiceChoice,
): Promise<DeckAudioResult> {
  const cards = await repo.listCards(deckId);
  const targets = cards.filter((c) => !cardHasAudio(c, side) && cardText(c, side).length > 0);
  const total = targets.length;
  let ok = 0;
  let failed = 0;
  let bytes = 0;
  let stopped = false;

  for (let i = 0; i < targets.length; i += 1) {
    try {
      const r = await generateAndStoreCardAudio(targets[i], settings, side, voice);
      ok += 1;
      bytes += r.bytes;
    } catch (e) {
      failed += 1;
      if (
        e instanceof TtsProviderError &&
        /cota|quota|429|esgotad|indispon|worker|configurad/i.test(e.message)
      ) {
        stopped = true;
        onProgress({ done: i + 1, total });
        break;
      }
    }
    onProgress({ done: i + 1, total });
    await delay(250); // gentil com limites de taxa
  }

  return { total, ok, failed, skipped: cards.length - total, bytes, stopped };
}
