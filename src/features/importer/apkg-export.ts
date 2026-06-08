import JSZip from 'jszip';
import { repo } from '../../db/repositories';
import { loadSqlJs } from './sqljs';
import { AUDIO_PROTOCOL, MEDIA_PROTOCOL } from '../media/media';
import { stripHtml } from '../../lib/text';
import {
  ANKI_SCHEMA,
  buildConf,
  buildDconf,
  buildDecks,
  buildModels,
} from './anki-schema';

const FIELD_SEP = String.fromCharCode(0x1f);

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
  };
  return map[mime] ?? 'bin';
}

function guid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let s = '';
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

/** Anki field checksum: int of the first 8 sha1 hex chars of the sort field. */
async function fieldChecksum(text: string): Promise<number> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-1', data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return parseInt(hex.slice(0, 8), 16);
}

/**
 * Export a Kioku deck as an Anki-compatible `.apkg` (best-effort; cards are
 * exported as new Basic notes with media). Round-trips through Kioku's own
 * importer.
 */
export async function exportApkg(deckId: string): Promise<{ blob: Blob; name: string }> {
  const deck = await repo.getDeck(deckId);
  if (!deck) throw new Error('Deck não encontrado.');
  const cards = await repo.listCards(deckId);

  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.run(ANKI_SCHEMA);

  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  const modelId = now;
  const ankiDeckId = now + 1;

  const zip = new JSZip();
  const mediaMap: Record<string, string> = {};
  let mediaIdx = 0;
  const idToFile = new Map<string, string>();

  async function exportMedia(kioId: string): Promise<string | null> {
    const cached = idToFile.get(kioId);
    if (cached) return cached;
    const m = await repo.getMedia(kioId);
    if (!m) return null;
    const fname = `kioku-${kioId.slice(0, 8)}.${extFromMime(m.mime)}`;
    const num = String(mediaIdx);
    mediaIdx += 1;
    zip.file(num, m.data);
    mediaMap[num] = fname;
    idToFile.set(kioId, fname);
    return fname;
  }

  async function rewriteForExport(html: string): Promise<string> {
    if (!html.includes(MEDIA_PROTOCOL) && !html.includes(AUDIO_PROTOCOL)) return html;
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

    // Images -> exported media filename in src.
    await Promise.all(
      Array.from(doc.querySelectorAll('img')).map(async (img) => {
        const src = img.getAttribute('src') ?? '';
        if (src.startsWith(MEDIA_PROTOCOL)) {
          const fname = await exportMedia(src.slice(MEDIA_PROTOCOL.length));
          if (fname) img.setAttribute('src', fname);
        }
      }),
    );

    // Audio chips -> Anki [sound:filename] (carries the real MP3 as media).
    await Promise.all(
      Array.from(doc.querySelectorAll('audio')).map(async (audio) => {
        const src = audio.getAttribute('src') ?? '';
        if (!src.startsWith(AUDIO_PROTOCOL)) return;
        const fname = await exportMedia(src.slice(AUDIO_PROTOCOL.length));
        const chip = audio.closest('.kioku-audio-chip') ?? audio;
        chip.replaceWith(doc.createTextNode(fname ? ` [sound:${fname}] ` : ''));
      }),
    );

    return doc.body.innerHTML;
  }

  try {
    db.run(
      'INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        1,
        nowSec,
        now,
        now,
        11,
        0,
        0,
        0,
        buildConf(modelId, cards.length + 1),
        buildModels(modelId),
        buildDecks(ankiDeckId, deck.name),
        buildDconf(),
        '{}',
      ],
    );

    let id = now;
    for (let i = 0; i < cards.length; i += 1) {
      const c = cards[i];
      const front = await rewriteForExport(c.front);
      const back = await rewriteForExport(c.back);
      const flds = `${front}${FIELD_SEP}${back}`;
      const sfld = stripHtml(front) || stripHtml(back);
      const nid = id;
      id += 1;
      const cid = id;
      id += 1;

      db.run(
        'INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [nid, guid(), modelId, nowSec, -1, '', flds, sfld, await fieldChecksum(sfld), 0, ''],
      );
      db.run(
        'INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [cid, nid, ankiDeckId, 0, nowSec, -1, 0, 0, i + 1, 0, 0, 0, 0, 0, 0, 0, 0, ''],
      );
    }

    const data = db.export();
    zip.file('collection.anki2', data);
    zip.file('media', JSON.stringify(mediaMap));
    const blob = await zip.generateAsync({ type: 'blob' });
    const name = `${deck.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'kioku-deck'}.apkg`;
    return { blob, name };
  } finally {
    db.close();
  }
}
