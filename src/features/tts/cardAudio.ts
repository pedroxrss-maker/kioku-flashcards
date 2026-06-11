/**
 * Resolução de áudio POR FACE de um card. Uma face (frente ou verso) tem áudio
 * quando: (a) o áudio gerado (cards.audio_path) foi feito para AQUELE lado, ou
 * (b) há um áudio anexado (chip kioku-audio://) no HTML daquele lado. O lado do
 * áudio gerado fica em settings.cardAudioSide (default 'front' para o legado).
 *
 * O áudio gerado do lado vence o chip anexado do mesmo lado (mesma prioridade da
 * revisão). Assim o botão de cada face toca a faixa daquela face.
 */
import { getSignedUrl } from '../media/storage';
import { firstAudioUrl } from '../media/media';
import type { AppSettings, Card } from '../../db/types';
import type { AudioSide } from './audioGen';

/** Lado que o áudio gerado (audio_path) fala. Default 'front'. */
export function generatedAudioSide(card: Card, settings: AppSettings | undefined): AudioSide {
  return settings?.cardAudioSide?.[card.id] ?? 'front';
}

/** Esta face tem áudio (gerado para ela, ou um chip anexado)? */
export function faceHasAudio(
  card: Card,
  side: AudioSide,
  settings: AppSettings | undefined,
): boolean {
  if (card.audioPath && generatedAudioSide(card, settings) === side) return true;
  const html = side === 'front' ? card.front : card.back;
  return html.includes('kioku-audio://');
}

/** URL tocável da face (ou null). O áudio gerado do lado vence o chip do lado. */
export async function faceAudioUrl(
  card: Card,
  side: AudioSide,
  settings: AppSettings | undefined,
): Promise<string | null> {
  if (card.audioPath && generatedAudioSide(card, settings) === side) {
    try {
      return await getSignedUrl(card.audioPath);
    } catch {
      /* não conseguiu assinar: tenta o chip anexado abaixo */
    }
  }
  const html = side === 'front' ? card.front : card.back;
  if (html.includes('kioku-audio://')) return firstAudioUrl(html);
  return null;
}
