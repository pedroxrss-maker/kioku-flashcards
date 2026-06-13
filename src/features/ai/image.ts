/**
 * AI image generation for cards.
 *
 * Pipeline (generateCardImage):
 *   1) ask the text AI (Gemini, via client.ts) for a short concrete visual
 *      description of the card,
 *   2) combine it with a FIXED house style (IMAGE_STYLE_SUFFIX),
 *   3) POST { prompt, size } to the image proxy Worker (VITE_IMAGE_PROXY_URL),
 *      which holds the OpenAI key and returns { image: "<base64 PNG>" },
 *   4) upload the PNG to the private "media" bucket (same path/format as a
 *      manually inserted card image), returning its storage path + a preview URL.
 *
 * Attaching the returned image to a card uses the SAME `kioku-media://<path>`
 * form the app already renders, so generated images look identical to manual
 * ones. A provisional global cap (IMAGE_GEN_CAP) is tracked in
 * profiles.settings.imageGenCount and incremented only on success.
 */
import { describeCardVisually } from './client';
import { uploadImageToStorage } from '../media/media';
import { recordStorageUpload } from '../media/usage';
import { repo } from '../../db/repositories';
import { getQueryData } from '../../db/store';
import { stripHtml } from '../../lib/text';
import type { AppSettings } from '../../db/types';
import type { CardType } from '../../lib/cardType';

/** Fixed house style appended to every visual prompt. Easy to edit in one place. */
export const IMAGE_STYLE_SUFFIX =
  'vibrant editorial illustration, dark background, saturated colors (magenta, electric blue, ' +
  'purple, cyan), flat sophisticated shapes, geometric decorative details, scientific-artistic ' +
  'anatomical-illustration style';

/** Provisional global per-user test cap (NOT the final limit). */
export const IMAGE_GEN_CAP = 20;

const PROXY_URL = import.meta.env.VITE_IMAGE_PROXY_URL;
const DEFAULT_SIZE = '1024x1024';

/** Carries a user-facing (pt-BR) message; safe to show in dialogs/toasts. */
export class ImageGenError extends Error {}

/** True when the image proxy Worker URL is configured. */
export function isImageGenConfigured(): boolean {
  return Boolean(PROXY_URL);
}

/* ----------------------------------------------------------------- cap ----- */
export function imagesUsed(settings?: AppSettings | null): number {
  return Math.max(0, settings?.imageGenCount ?? 0);
}
export function imagesRemaining(settings?: AppSettings | null): number {
  return Math.max(0, IMAGE_GEN_CAP - imagesUsed(settings));
}
export function atImageCap(settings?: AppSettings | null): boolean {
  return imagesUsed(settings) >= IMAGE_GEN_CAP;
}

/** Increment the persisted counter (call once per SUCCESSFUL generation). */
export async function recordImageGeneration(): Promise<void> {
  const settings = getQueryData<AppSettings>('settings') ?? (await repo.getSettings());
  await repo.saveSettings({ imageGenCount: imagesUsed(settings) + 1 });
}

/* ---------------------------------------------------------- attach helpers - */
/** Which side a generated image goes on: type-in keeps its exact answer in
 *  `back`, so its image goes on the front (prompt); others use the back. */
export function imageSideForType(type: CardType): 'front' | 'back' {
  return type === 'typein' ? 'front' : 'back';
}

/** Storage-form <img> (kioku-media://<path>) — resolveMediaHtml signs it later. */
export function imageStorageTag(path: string): string {
  return `<img src="kioku-media://${path}" alt="">`;
}

/** Append a stored image to a side's HTML (used by the deck-generation flow). */
export function appendImageHtml(html: string, path: string): string {
  const img = imageStorageTag(path);
  return html && html.trim() ? `${html}<br>${img}` : img;
}

/* ------------------------------------------------------------- generate ---- */
function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function generateImageBase64(prompt: string, size = DEFAULT_SIZE): Promise<string> {
  if (!PROXY_URL) {
    throw new ImageGenError(
      'Geração de imagens não configurada. Defina VITE_IMAGE_PROXY_URL e refaça o build.',
    );
  }
  let res: Response;
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, size }),
    });
  } catch {
    throw new ImageGenError('Falha de conexão com o gerador de imagens. Verifique sua internet.');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) detail = `: ${j.error}`;
    } catch {
      /* ignore body parse errors */
    }
    throw new ImageGenError(`Não foi possível gerar a imagem (HTTP ${res.status})${detail}.`);
  }
  const data = (await res.json()) as { image?: string };
  if (!data.image) throw new ImageGenError('O gerador não retornou nenhuma imagem. Tente novamente.');
  return data.image;
}

/**
 * Generate an illustration for a card and upload it to Storage. Returns the
 * storage object path (embed as kioku-media://<path>) + a local preview URL.
 * Throws ImageGenError / a storage error on failure (caller catches). Does NOT
 * touch the cap counter — call recordImageGeneration() after a success.
 */
export async function generateCardImage(opts: {
  front: string;
  back: string;
  deckId: string;
}): Promise<{ path: string; url: string }> {
  const visual = await describeCardVisually(stripHtml(opts.front), stripHtml(opts.back));
  // "<concrete scene>. <fixed house style>"
  const prompt = `${visual.replace(/[.\s]+$/, '')}. ${IMAGE_STYLE_SUFFIX}`;
  const b64 = await generateImageBase64(prompt);
  const blob = base64ToBlob(b64, 'image/png');
  const { path, url, bytes } = await uploadImageToStorage(blob, opts.deckId);
  void recordStorageUpload(bytes); // track Storage usage, same as manual inserts
  return { path, url };
}
