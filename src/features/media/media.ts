import { repo } from '../../db/repositories';

/**
 * Media handling. Images live as `MediaBlob` rows in IndexedDB and are
 * referenced from card HTML as `kioku-media://<id>`. At render time we swap
 * those refs for object URLs; in the editor we additionally tag <img> with
 * `data-kioku-media` so we can serialize back to the storage form.
 */

const MEDIA_PROTOCOL = 'kioku-media://';

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

/** Storage HTML (kioku-media refs) -> display HTML (object URLs). */
export async function resolveMediaHtml(html: string): Promise<string> {
  if (!html.includes(MEDIA_PROTOCOL)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith(MEDIA_PROTOCOL)) {
        const id = src.slice(MEDIA_PROTOCOL.length);
        const url = await objectUrlForMedia(id);
        if (url) img.setAttribute('src', url);
      }
    }),
  );
  return doc.body.innerHTML;
}

/** Storage HTML -> editor HTML (object URLs + data-kioku-media tag). */
export async function toEditorHtml(html: string): Promise<string> {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') ?? '';
      if (src.startsWith(MEDIA_PROTOCOL)) {
        const id = src.slice(MEDIA_PROTOCOL.length);
        const url = await objectUrlForMedia(id);
        if (url) {
          img.setAttribute('src', url);
          img.setAttribute('data-kioku-media', id);
        }
      }
    }),
  );
  return doc.body.innerHTML;
}

/** Editor HTML -> storage HTML (data-kioku-media imgs become kioku-media refs). */
export function fromEditorHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('img[data-kioku-media]').forEach((img) => {
    const id = img.getAttribute('data-kioku-media');
    if (id) {
      img.setAttribute('src', `${MEDIA_PROTOCOL}${id}`);
      img.removeAttribute('data-kioku-media');
    }
  });
  return doc.body.innerHTML;
}

/** Persist an image file as a MediaBlob, returning its id + a display URL. */
export async function storeImage(
  file: Blob,
): Promise<{ id: string; url: string }> {
  const id = crypto.randomUUID();
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

export { MEDIA_PROTOCOL };
