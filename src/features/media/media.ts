import { repo } from '../../db/repositories';
import { uuid } from '../../lib/uuid';
import { getSignedUrl, mediaObjectPath, uploadMedia } from './storage';
import { resizeImageBlob } from './image';

/**
 * Media handling. A card references media in its HTML with custom URIs:
 *   - images  -> `kioku-media://<id>`  (rendered as <img>)
 *   - audio   -> `kioku-audio://<id>`  (rendered as a playable <audio> chip)
 *
 * The `<id>` is either a Supabase Storage object path (contains "/", resolved to
 * a short-lived signed URL) or a legacy IndexedDB MediaBlob id (a bare uuid,
 * resolved to a local object URL). Both schemes coexist so old cards keep
 * working. At render time we swap refs for URLs; in the editor we additionally
 * tag the element (`data-kioku-media` / `data-kioku-audio`) so we can serialize
 * back to the storage form.
 */

const MEDIA_PROTOCOL = 'kioku-media://';
const AUDIO_PROTOCOL = 'kioku-audio://';

// One object URL per media id, reused across renders (not revoked in v1,
// bounded by the number of distinct media blobs).
const urlCache = new Map<string, string>();

export async function objectUrlForMedia(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const media = await repo.getMedia(id);
  if (!media) return null;
  const url = URL.createObjectURL(media.data);
  urlCache.set(id, url);
  return url;
}

function refId(src: string): { id: string; isAudio: boolean } | null {
  if (src.startsWith(MEDIA_PROTOCOL)) return { id: src.slice(MEDIA_PROTOCOL.length), isAudio: false };
  if (src.startsWith(AUDIO_PROTOCOL)) return { id: src.slice(AUDIO_PROTOCOL.length), isAudio: true };
  return null;
}

/** A ref id with a "/" is a Storage object path; a bare id is a legacy blob. */
function isStoragePath(id: string): boolean {
  return id.includes('/');
}

/** Resolve a media ref id to a displayable URL: Storage paths become short-lived
 *  signed URLs, legacy ids become IndexedDB object URLs. Never throws (returns
 *  null so one broken media never blocks the whole card render). */
async function urlForRef(id: string): Promise<string | null> {
  try {
    return isStoragePath(id) ? await getSignedUrl(id) : await objectUrlForMedia(id);
  } catch {
    return null;
  }
}

/**
 * Remove attached-audio chips and leftover `[sound:...]` tokens from card HTML.
 * Used both to hide audio at render time when a deck has audio disabled and for
 * the permanent "remove all audio" bulk action.
 */
export function stripAudioHtml(html: string): string {
  if (!html) return '';
  if (!html.includes('kioku-audio') && !html.includes('<audio') && !/\[sound:/i.test(html)) {
    return html;
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('.kioku-audio-chip, audio').forEach((el) => el.remove());
  return doc.body.innerHTML.replace(/\[sound:[^\]]*\]/gi, '').trim();
}

/**
 * Resolve the FIRST attached-audio ref in card HTML to a playable URL (signed
 * Storage URL or local object URL). Returns null when the card has no attached
 * audio. Lets review play/replay the audio without relying on a rendered
 * <audio> element (which may be hidden by the deck's audio toggle).
 */
export async function firstAudioUrl(html: string): Promise<string | null> {
  if (!html || !html.includes(AUDIO_PROTOCOL)) return null;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const el of Array.from(doc.querySelectorAll('audio'))) {
    const ref = refId(el.getAttribute('src') ?? '');
    if (ref?.isAudio) {
      const url = await urlForRef(ref.id);
      if (url) return url;
    }
  }
  return null;
}

/**
 * Warm the cache for a card's images BEFORE it is shown: resolve each ref's
 * (signed) URL ahead of time — reusing the in-memory signed-URL cache so it is
 * not re-signed at render — and kick off the download via `new Image()`. By the
 * time the user advances, the next card's media is already cached and paints with
 * no blank flash. Best-effort and non-throwing; ignores audio refs.
 */
export async function prefetchMediaHtml(html: string): Promise<void> {
  if (!html || typeof Image === 'undefined') return;
  if (!html.includes(MEDIA_PROTOCOL) && !/<img/i.test(html)) return;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img'));
  if (imgs.length === 0) return;
  await Promise.all(
    imgs.map(async (el) => {
      const src = el.getAttribute('src') ?? '';
      const ref = refId(src);
      let url: string | null = null;
      if (ref && !ref.isAudio) url = await urlForRef(ref.id);
      else if (/^(https?:|blob:|data:)/i.test(src)) url = src;
      if (!url) return;
      // Decode off the main thread; never inserted into the document.
      const im = new Image();
      im.decoding = 'async';
      im.src = url; // warms the browser HTTP/image cache
    }),
  );
}

/** Storage HTML (kioku-media / kioku-audio refs) -> display HTML (object URLs). */
export async function resolveMediaHtml(html: string): Promise<string> {
  if (!html.includes(MEDIA_PROTOCOL) && !html.includes(AUDIO_PROTOCOL)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const els = Array.from(doc.querySelectorAll('img, audio'));
  await Promise.all(
    els.map(async (el) => {
      const ref = refId(el.getAttribute('src') ?? '');
      if (!ref) return;
      const url = await urlForRef(ref.id);
      if (url) el.setAttribute('src', url);
    }),
  );
  return doc.body.innerHTML;
}

/** Storage HTML -> editor HTML (object URLs + data-kioku-* tags). */
export async function toEditorHtml(html: string): Promise<string> {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const els = Array.from(doc.querySelectorAll('img, audio'));
  await Promise.all(
    els.map(async (el) => {
      const ref = refId(el.getAttribute('src') ?? '');
      if (!ref) return;
      const url = await urlForRef(ref.id);
      if (!url) return;
      el.setAttribute('src', url);
      el.setAttribute(ref.isAudio ? 'data-kioku-audio' : 'data-kioku-media', ref.id);
    }),
  );
  return doc.body.innerHTML;
}

/** Editor HTML -> storage HTML (data-kioku-* elements become custom-URI refs). */
export function fromEditorHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  // A lixeira do editor (canto do chip de áudio) é só UI: nunca é salva.
  doc.querySelectorAll('.kioku-audio-del').forEach((el) => el.remove());
  doc.querySelectorAll('img[data-kioku-media]').forEach((img) => {
    const id = img.getAttribute('data-kioku-media');
    if (id) {
      img.setAttribute('src', `${MEDIA_PROTOCOL}${id}`);
      img.removeAttribute('data-kioku-media');
    }
  });
  doc.querySelectorAll('audio[data-kioku-audio]').forEach((audio) => {
    const id = audio.getAttribute('data-kioku-audio');
    if (id) {
      audio.setAttribute('src', `${AUDIO_PROTOCOL}${id}`);
      audio.removeAttribute('data-kioku-audio');
    }
  });
  return doc.body.innerHTML;
}

/** Persist an image file as a MediaBlob, returning its id + a display URL. */
export async function storeImage(
  file: Blob,
): Promise<{ id: string; url: string }> {
  const id = uuid();
  await repo.putMedia({
    id,
    mime: file.type || 'image/png',
    data: file,
    createdAt: Date.now(),
  });
  const url = URL.createObjectURL(file);
  urlCache.set(id, url);
  return { id, url };
}

/** Persist an audio Blob (e.g. a generated MP3) as a MediaBlob. */
export async function storeAudio(
  blob: Blob,
): Promise<{ id: string; url: string }> {
  const id = uuid();
  await repo.putMedia({
    id,
    mime: blob.type || 'audio/mpeg',
    data: blob,
    createdAt: Date.now(),
  });
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return { id, url };
}

/**
 * Upload an image to the private "media" bucket (downscaled first), returning the
 * Storage object path to embed (as kioku-media://<path>), a local preview URL for
 * instant insertion, and the uploaded byte size (for usage tracking).
 */
export async function uploadImageToStorage(
  file: Blob,
  deckId: string,
): Promise<{ path: string; url: string; bytes: number }> {
  let blob: Blob = file;
  let ext = 'jpg';
  let contentType = file.type || 'image/jpeg';
  try {
    const r = await resizeImageBlob(file);
    blob = r.blob;
    ext = r.ext;
    contentType = r.contentType;
  } catch {
    // Could not decode/resize: upload the original bytes as-is.
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';
  }
  const path = await mediaObjectPath(deckId, `img_${uuid().slice(0, 8)}.${ext}`);
  await uploadMedia(path, blob, contentType);
  // Local preview URL for an instant insert; resolveMediaHtml signs the path later.
  const url = URL.createObjectURL(blob);
  return { path, url, bytes: blob.size };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the editor-form HTML for a stored-audio chip (object URL src +
 * data-kioku-audio). `fromEditorHtml` serializes it to the kioku-audio:// form.
 */
export function audioChipHtml(opts: { id: string; url: string; label: string }): string {
  return (
    `<span class="kioku-audio-chip" contenteditable="false">` +
    `<span class="kioku-audio-lbl">🔊 ${escapeHtml(opts.label)}</span>` +
    `<audio controls preload="none" data-kioku-audio="${opts.id}" src="${opts.url}"></audio>` +
    `</span>`
  );
}

export { MEDIA_PROTOCOL, AUDIO_PROTOCOL };
