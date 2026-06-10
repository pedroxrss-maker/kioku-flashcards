import { repo } from '../../db/repositories';
import { uuid } from '../../lib/uuid';

/**
 * Media handling. Images and audio both live as `MediaBlob` rows in IndexedDB.
 * Card HTML references them with custom URIs:
 *   - images  -> `kioku-media://<id>`  (rendered as <img>)
 *   - audio   -> `kioku-audio://<id>`  (rendered as a playable <audio> chip)
 * At render time we swap those refs for object URLs; in the editor we additionally
 * tag the element (`data-kioku-media` / `data-kioku-audio`) so we can serialize
 * back to the storage form. Audio works offline with no API key once stored.
 */

const MEDIA_PROTOCOL = 'kioku-media://';
const AUDIO_PROTOCOL = 'kioku-audio://';

// One object URL per media id, reused across renders (not revoked in v1 —
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

/** Storage HTML (kioku-media / kioku-audio refs) -> display HTML (object URLs). */
export async function resolveMediaHtml(html: string): Promise<string> {
  if (!html.includes(MEDIA_PROTOCOL) && !html.includes(AUDIO_PROTOCOL)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const els = Array.from(doc.querySelectorAll('img, audio'));
  await Promise.all(
    els.map(async (el) => {
      const ref = refId(el.getAttribute('src') ?? '');
      if (!ref) return;
      const url = await objectUrlForMedia(ref.id);
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
      const url = await objectUrlForMedia(ref.id);
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
