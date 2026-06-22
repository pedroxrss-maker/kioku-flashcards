/**
 * Resolução de áudio POR FACE de um card. Uma face (frente ou verso) tem áudio
 * quando: (a) o áudio gerado (cards.audio_path) foi feito para AQUELE lado, ou
 * (b) há um áudio anexado (chip kioku-audio://) no HTML daquele lado. O lado do
 * áudio gerado fica em settings.cardAudioSide (default 'front' para o legado).
 *
 * O áudio gerado do lado vence o chip anexado do mesmo lado (mesma prioridade da
 * revisão). Assim o botão de cada face toca a faixa daquela face.
 */
import { getSignedUrl, getSignedUrls } from '../media/storage';
import { firstAudioUrl, storagePathsInHtml } from '../media/media';
import type { AppSettings, Card } from '../../db/types';
import type { AudioSide } from './audioGen';

/**
 * Lado que o áudio gerado (audio_path) fala.
 *  - Se há registro explícito (settings.cardAudioSide), usa ele.
 *  - Legado sem registro: se só UM lado tem áudio anexado (chip), o áudio
 *    gerado é provavelmente do OUTRO lado (você não geraria áudio do lado que
 *    já tem um áudio anexado). Senão, assume 'front'.
 */
export function generatedAudioSide(card: Card, settings: AppSettings | undefined): AudioSide {
  const tracked = settings?.cardAudioSide?.[card.id];
  if (tracked) return tracked;
  const frontChip = card.front.includes('kioku-audio://');
  const backChip = card.back.includes('kioku-audio://');
  if (frontChip && !backChip) return 'back';
  if (backChip && !frontChip) return 'front';
  return 'front';
}

/**
 * Caminho do áudio gerado desta face. O mapa novo por lado
 * (settings.cardAudio[cardId][side]) vence; senão cai no caminho único legado
 * (audio_path) quando ele fala este lado. undefined se não há áudio gerado.
 */
export function generatedFacePath(
  card: Card,
  side: AudioSide,
  settings: AppSettings | undefined,
): string | undefined {
  const perSide = settings?.cardAudio?.[card.id]?.[side];
  if (perSide) return perSide;
  if (card.audioPath && generatedAudioSide(card, settings) === side) return card.audioPath;
  return undefined;
}

/** Esta face tem áudio (gerado para ela, ou um chip anexado)? */
export function faceHasAudio(
  card: Card,
  side: AudioSide,
  settings: AppSettings | undefined,
): boolean {
  if (generatedFacePath(card, side, settings)) return true;
  const html = side === 'front' ? card.front : card.back;
  return html.includes('kioku-audio://');
}

/** Todos os caminhos de mídia em Storage de um card (áudio gerado das duas faces
 *  + imagens/chips de áudio anexados no HTML). Usado para ASSINAR em lote. */
export function cardMediaStoragePaths(card: Card, settings: AppSettings | undefined): string[] {
  const paths = new Set<string>();
  for (const side of ['front', 'back'] as const) {
    const p = generatedFacePath(card, side, settings);
    if (p && p.includes('/')) paths.add(p); // caminho de Storage (legado/blob não tem "/")
  }
  for (const p of storagePathsInHtml(card.front)) paths.add(p);
  for (const p of storagePathsInHtml(card.back)) paths.add(p);
  return [...paths];
}

/**
 * Pré-assina, em UMA requisição, toda a mídia (áudio + imagens) de um punhado de
 * cards (o atual + 1-2 à frente). Aquece o cache de URLs assinadas, então o
 * render do card e o botão de áudio leem do cache sem novas chamadas. Best-effort.
 */
export async function warmCardMedia(
  cards: Card[],
  settings: AppSettings | undefined,
): Promise<void> {
  const paths = new Set<string>();
  for (const c of cards) for (const p of cardMediaStoragePaths(c, settings)) paths.add(p);
  if (paths.size === 0) return;
  try {
    await getSignedUrls([...paths]);
  } catch {
    /* aquecimento best-effort; cada resolução cai no caminho individual se falhar */
  }
}

/** URL tocável da face (ou null). O áudio gerado do lado vence o chip do lado. */
export async function faceAudioUrl(
  card: Card,
  side: AudioSide,
  settings: AppSettings | undefined,
): Promise<string | null> {
  const path = generatedFacePath(card, side, settings);
  if (path) {
    try {
      return await getSignedUrl(path);
    } catch {
      /* não conseguiu assinar: tenta o chip anexado abaixo */
    }
  }
  const html = side === 'front' ? card.front : card.back;
  if (html.includes('kioku-audio://')) return firstAudioUrl(html);
  return null;
}
