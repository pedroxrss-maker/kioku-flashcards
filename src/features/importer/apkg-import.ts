import JSZip from 'jszip';
import { decompress } from 'fzstd';
import { repo } from '../../db/repositories';
import { DECK_COLORS, makeCard } from '../../db/factories';
import { leafName } from '../../lib/deckTree';
import { markTypeIn } from '../../lib/cardType';
import { clozeKeepActive } from '../../lib/cloze';
import { stripHtml } from '../../lib/text';
import { mimeFromName } from './mime';
import { loadSqlJs } from './sqljs';
import { currentUserId, sanitizeSegment, StorageUnavailableError, uploadMedia } from '../media/storage';
import { resizeImageBlob } from '../media/image';
import { recordStorageUpload, warnIfStorageHigh } from '../media/usage';
import type { Card, CardState, FsrsFields, Sm2Fields } from '../../db/types';

// Anki separates note fields with the Unit Separator control char (0x1f).
const FIELD_SEP = String.fromCharCode(0x1f);
const DAY = 86_400_000;

// Anki package v3 stores the real collection (collection.anki21b) and the media
// (manifest + blobs) zstd-compressed. Detect by the zstd magic bytes.
function isZstd(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
}

/** Read a zip member as bytes, transparently zstd-decompressing if needed. */
async function memberBytes(zip: JSZip, name: string): Promise<Uint8Array | null> {
  const entry = zip.file(name);
  if (!entry) return null;
  const raw = await entry.async('uint8array');
  return isZstd(raw) ? decompress(raw) : raw;
}

/**
 * Minimal parser for the v3 `media` manifest (protobuf `MediaEntries`). We only
 * need the ordered filenames: entry i corresponds to the zip member named "i".
 * Each `MediaEntry` is field 1 (length-delimited) of MediaEntries; its `name` is
 * field 1 (length-delimited string) of the entry. Everything else is skipped.
 */
export function parseMediaEntries(buf: Uint8Array): string[] {
  let p = 0;
  const varint = (): number => {
    let shift = 0;
    let result = 0;
    while (p < buf.length) {
      const b = buf[p++];
      result += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  };
  const skip = (wt: number) => {
    if (wt === 0) varint();
    else if (wt === 2) p += varint();
    else if (wt === 5) p += 4;
    else if (wt === 1) p += 8;
  };
  const names: string[] = [];
  while (p < buf.length) {
    const tag = varint();
    const field = tag >> 3;
    const wt = tag & 7;
    if (field === 1 && wt === 2) {
      const msgLen = varint();
      const end = p + msgLen; // MediaEntry message bounds (read len first!)
      let name = '';
      while (p < end) {
        const t2 = varint();
        const f2 = t2 >> 3;
        const w2 = t2 & 7;
        if (f2 === 1 && w2 === 2) {
          const len = varint();
          name = new TextDecoder().decode(buf.subarray(p, p + len));
          p += len;
        } else {
          skip(w2);
        }
      }
      p = end;
      names.push(name);
    } else {
      skip(wt);
    }
  }
  return names;
}

/** Base64-encode raw bytes (used as a fallback for non-resizable media). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * Downscale an image blob to <= `max` px on its longest side and return a
 * compact data: URL. Imported images are embedded inline in the card HTML (not
 * stored as local-only MediaBlobs), so they sync with the card to Supabase and
 * render on every device. Resizing keeps the synced rows small.
 */
async function resizedDataUrl(blob: Blob, mime: string, max = 700): Promise<string> {
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image decode failed'));
      i.src = objUrl;
    });
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, max / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, w, h);
    // Keep PNG (transparency); compress the rest as JPEG.
    const keepPng = mime === 'image/png' || mime === 'image/webp';
    return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/**
 * Strip Anki-only markup that would otherwise leak onto the card as literal
 * text, and tidy the leftover whitespace. The `[sound:...]` token is removed
 * from the visible text here; the importer captures those filenames first and
 * uploads the audio separately. (Image filenames in `<img src>` are left intact
 * and rewritten to Storage refs after the deck exists.)
 */
export function cleanAnkiMarkup(html: string): string {
  return html
    .replace(/\[sound:[^\]]*\]/gi, '') // [sound:file.mp3] -> removed
    .replace(/\[anki:[^\]]*\]/gi, '') // leftover [anki:...] tags
    .replace(/[ \t]{2,}/g, ' ') // collapse runs of spaces/tabs
    .replace(/(?:\s*<br\s*\/?>\s*){3,}/gi, '<br><br>') // collapse 3+ <br> to 2
    .replace(/^(?:\s*<br\s*\/?>\s*)+/i, '') // drop leading <br>
    .replace(/(?:\s*<br\s*\/?>\s*)+$/i, '') // drop trailing <br>
    .replace(/\n{3,}/g, '\n\n') // collapse blank lines
    .trim();
}

/** Cloze numbers present in a field, sorted ascending & deduped. An Anki cloze
 *  card's ordinal indexes into this list (ord 0 -> the first cloze number). */
export function clozeNumbers(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\{\{c(\d+)::/g)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

/**
 * Render Anki cloze markup for one card. The `active` cloze is blanked on the
 * question (`[...]`, or `[hint]` when a hint is given) and revealed in bold on
 * the answer; every other cloze is shown as its plain text on both sides,
 * exactly how Anki presents a cloze card.
 */
export function renderClozeText(text: string, active: number, isAnswer: boolean): string {
  return text.replace(/\{\{c(\d+)::(.*?)\}\}/gs, (_full, n: string, inner: string) => {
    const sep = inner.indexOf('::');
    const answer = sep >= 0 ? inner.slice(0, sep) : inner;
    const hint = sep >= 0 ? inner.slice(sep + 2) : '';
    if (Number(n) === active) {
      return isAnswer ? `<b>${answer}</b>` : `[${hint || '...'}]`;
    }
    return answer;
  });
}


interface MappedScheduling {
  state: CardState;
  due: number;
  sm2: Sm2Fields;
  fsrs?: FsrsFields; // override only when Anki carried FSRS memory state
}

/**
 * Translate one Anki card's scheduling (cards table row) into Kioku fields, so
 * the user keeps studying where they left off. Best-effort.
 *
 * `fsrs` is set ONLY when the collection shipped real FSRS memory state; its
 * presence is also how the importer tells an FSRS deck from a classic SM-2 one.
 */
export function mapScheduling(
  type: number,
  _queue: number, // suspended/buried (negative) — kept for call-site parity; Kioku has no suspend
  due: number,
  ivl: number,
  factor: number,
  reps: number,
  lapses: number,
  data: string,
  colCrtMs: number,
  nowMs: number,
): MappedScheduling {
  // State follows Anki's card TYPE (0=new, 1=learning, 2=review, 3=relearning).
  // Suspended/buried cards have a negative `queue`, but Kioku has NO suspend/bury
  // concept — so we map them by their type and let them stay due like any other
  // card (nothing is hidden or zeroed on import).
  let state: CardState;
  if (type === 2) state = 'review';
  else if (type === 1) state = 'learning';
  else if (type === 3) state = 'relearning';
  else state = 'new';

  // Interval (days). Anki `ivl` > 0 is already in DAYS (use as-is). `ivl` < 0 is a
  // negative SECONDS value (an intraday learning step): convert seconds -> days
  // ONLY for review cards; learning/relearning keep intervalDays 0 so they
  // continue in the learning flow.
  let intervalDays = 0;
  if (ivl > 0) intervalDays = ivl;
  else if (ivl < 0 && type === 2) intervalDays = Math.max(1, Math.ceil(-ivl / 86_400));

  // Due datetime:
  //   - review (type 2): Anki `due` is a DAY NUMBER since col.crt.
  //   - learning/relearning (type 1/3): Anki `due` is a unix timestamp (seconds).
  //   - new (type 0): `due` is only an ordering position, not a date -> due now
  //     (new cards are introduced by the daily new limit, not by their due).
  let dueMs: number;
  if (type === 2) dueMs = colCrtMs + due * DAY;
  else if (type === 1 || type === 3) dueMs = due * 1000;
  else dueMs = nowMs;
  // A card cannot legitimately be due before its collection existed; such a value
  // is a broken/edge conversion (e.g. a day-learning `due` read as epoch seconds)
  // -> make it due now so it still surfaces immediately. Genuinely-overdue dates
  // (after crt) are kept exactly, preserving the real due date.
  if (dueMs < colCrtMs) dueMs = nowMs;

  // SM-2 fields. Anki `factor` is ease×1000 (2500 -> 2.5); new cards (factor 0)
  // get Kioku's default starting ease. `step` 0 keeps (re)learning cards in flow.
  const sm2: Sm2Fields = {
    ease: factor > 0 ? factor / 1000 : 2.5,
    intervalDays,
    reps,
    lapses,
    step: 0,
    isLeech: false,
  };

  // FSRS memory state lives in the card "data" JSON ({"s":stability,"d":difficulty}).
  let fsrs: FsrsFields | undefined;
  try {
    const d = JSON.parse(data || '{}') as { s?: number; d?: number };
    if (typeof d.s === 'number' && typeof d.d === 'number') {
      fsrs = {
        stability: d.s,
        difficulty: d.d,
        elapsedDays: intervalDays,
        scheduledDays: intervalDays,
        learningSteps: 0,
        reps,
        lapses,
        // Back-date the last review to when Anki actually scheduled this card
        // (due − interval) so FSRS derives the correct elapsed time on the next
        // review. Using "now" would make every imported card look freshly
        // reviewed and shrink its next interval.
        lastReview: state === 'new' ? null : dueMs - intervalDays * DAY,
      };
    }
  } catch {
    /* no FSRS data -> initialize normally */
  }

  return { state, due: dueMs, sm2, fsrs };
}

export interface ImportResult {
  /** Primary deck to open from the "Ver deck" button (the largest one). */
  deckId: string;
  deckName: string;
  /** How many Kioku decks were created (one per non-empty Anki subdeck). */
  deckCount: number;
  cardCount: number;
  mediaCount: number;
  warnings: string[];
}

export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
}

/** Choice the caller returns when imported deck name(s) collide with existing ones:
 *  - 'replace'  → delete the existing same-named deck(s) and import in their place
 *  - 'separate' → import as new, separate decks (legacy behavior)
 *  - 'cancel'   → abort the import, create nothing */
export type CollisionResolution = 'replace' | 'separate' | 'cancel';

/** Thrown internally when the caller aborts the import (rolled back, then re-thrown). */
class ImportCancelledError extends Error {
  constructor() {
    super('Importação cancelada.');
    this.name = 'ImportCancelledError';
  }
}

/** True if the collection is the legacy "Please update..." placeholder (v3). */
function looksLikePlaceholder(db: { exec: (sql: string) => Array<{ values: unknown[][] }> }): boolean {
  try {
    const vals = db.exec('SELECT flds FROM notes')[0]?.values ?? [];
    return (
      vals.length === 1 &&
      String(vals[0][0] ?? '').includes('Please update to the latest Anki version')
    );
  } catch {
    return false;
  }
}

/**
 * Import an Anki `.apkg` (zip of a SQLite collection + media). Supports both the
 * legacy raw-SQLite format and the new v3 format (zstd-compressed
 * collection.anki21b). Notes/cards are translated to a Kioku deck, Anki
 * scheduling is preserved best-effort. Imported `<img>` and `[sound:]` media is
 * uploaded to the private "media" Storage bucket and referenced by signed URL;
 * if Storage is unavailable, images fall back to inline data URLs so the import
 * still succeeds (audio is then skipped).
 */
export async function importApkg(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  onProgress?: (p: ImportProgress) => void,
  /** Abort the import; partially-created decks are rolled back. */
  signal?: AbortSignal,
  /** Asked once, BEFORE any deck/media is created, when one or more decks the
   *  .apkg would create share a name (case-insensitive, full path) with an
   *  existing deck. The returned choice applies to ALL colliding decks. When
   *  omitted, collisions import as separate decks (legacy behavior). */
  onCollision?: (collidingNames: string[]) => Promise<CollisionResolution>,
): Promise<ImportResult> {
  const warnings: string[] = [];
  // Parse from the in-memory buffer the caller already read (never from a File
  // reference, which can go stale for large/cloud-synced files mid-read).
  const zip = await JSZip.loadAsync(data);

  // ---- pick + load the real collection (prefer the v3 anki21b) --------------
  const SQL = await loadSqlJs();
  let dbBytes: Uint8Array | null = null;
  let loadedName = '';
  for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    const bytes = await memberBytes(zip, name);
    if (bytes) {
      dbBytes = bytes;
      loadedName = name;
      break;
    }
  }
  if (!dbBytes) throw new Error('Coleção não encontrada no arquivo .apkg.');

  let db = new SQL.Database(dbBytes);
  // Safety net: if we somehow loaded the legacy placeholder, switch to anki21b.
  if (looksLikePlaceholder(db) && loadedName !== 'collection.anki21b') {
    const realBytes = await memberBytes(zip, 'collection.anki21b');
    if (realBytes) {
      db.close();
      db = new SQL.Database(realBytes);
    }
  }

  // Decks created so far, so a cancel can roll them back (their cards are only
  // inserted at the very end, so a cancelled deck would otherwise be left empty).
  const createdDeckIds: string[] = [];

  try {
    // ---- media map (filename -> zip member). The manifest may be zstd-compressed
    //      and is JSON in the legacy format or protobuf in the v3 format. ------
    const fileByName = new Map<string, string>();
    try {
      const mediaBytes = await memberBytes(zip, 'media');
      if (mediaBytes) {
        try {
          // Legacy: a JSON map { "0": "filename", ... }.
          const map = JSON.parse(new TextDecoder().decode(mediaBytes)) as Record<string, string>;
          for (const [num, name] of Object.entries(map)) fileByName.set(name, num);
        } catch {
          // New v3: protobuf MediaEntries; entry index i -> zip member "i".
          parseMediaEntries(mediaBytes).forEach((name, i) => {
            if (name) fileByName.set(name, String(i));
          });
        }
      }
    } catch {
      warnings.push('Não foi possível ler a lista de mídias do arquivo.');
    }

    // ---- media: upload imported files to the private "media" bucket, with an
    //      inline-data fallback for images when Storage is unavailable. Audio is
    //      imported as attached chips (kioku-audio://path). --------------------
    let uid = '';
    let storageOk = true;
    try {
      uid = await currentUserId();
    } catch {
      // Not signed in: Storage uploads are impossible. Images fall back to inline
      // data URLs; audio cannot be imported.
      storageOk = false;
    }
    let mediaCount = 0; // distinct media files placed (uploaded or embedded)
    let mediaBytes = 0; // uploaded bytes, for the usage warning
    let audioImported = 0;
    let audioDropped = false;

    const bytesCache = new Map<string, Uint8Array | null>();
    async function rawMediaBytes(filename: string): Promise<Uint8Array | null> {
      if (bytesCache.has(filename)) return bytesCache.get(filename) ?? null;
      const key = fileByName.get(filename) ?? fileByName.get(decodeURIComponent(filename));
      const entry = key ? zip.file(key) : null;
      if (!entry) {
        bytesCache.set(filename, null);
        return null;
      }
      const raw = await entry.async('uint8array');
      const bytes = isZstd(raw) ? decompress(raw) : raw; // v3 stores media zstd-compressed
      bytesCache.set(filename, bytes);
      return bytes;
    }

    // Limited-concurrency runner so a huge collection never fires hundreds of
    // uploads at once.
    async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
      let idx = 0;
      const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
        while (idx < items.length) {
          const i = idx;
          idx += 1;
          await fn(items[i]);
        }
      });
      await Promise.all(workers);
    }

    const soundFilesIn = (text: string): string[] =>
      [...String(text).matchAll(/\[sound:([^\]]+)\]/gi)].map((m) => m[1].trim()).filter(Boolean);

    // A src we should upload: a bare media filename, not an already-inline data
    // URL, an existing kioku ref, or an external http(s) URL (left untouched).
    const isLocalMediaSrc = (s: string): boolean =>
      !!s && !s.startsWith('data:') && !s.startsWith('kioku-') && !/^https?:\/\//i.test(s);

    function imgSrcsIn(html: string): string[] {
      if (!html.includes('<img')) return [];
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      return Array.from(doc.querySelectorAll('img'))
        .map((img) => img.getAttribute('src') ?? '')
        .filter(isLocalMediaSrc);
    }

    /** Replace <img src="filename"> with the resolved ref (Storage or inline data
     *  URL); drop images we could not resolve so no broken filenames remain. */
    function rewriteImgs(html: string, refs: Map<string, string>): string {
      if (!html.includes('<img')) return html;
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      doc.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src') ?? '';
        if (!isLocalMediaSrc(src)) return; // leave data/kioku/external srcs as-is
        const ref = refs.get(src) ?? refs.get(decodeURIComponent(src));
        if (ref) img.setAttribute('src', ref);
        else img.remove();
      });
      return doc.body.innerHTML;
    }

    function audioChip(ref: string, label: string): string {
      const safe = label
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return (
        '<span class="kioku-audio-chip" contenteditable="false">' +
        `<span class="kioku-audio-lbl">🔊 ${safe}</span>` +
        `<audio controls preload="none" src="${ref}"></audio>` +
        '</span>'
      );
    }

    /** Upload one deck's images + audio to Storage, returning filename -> ref maps.
     *  Per-file failures are tolerated; a StorageUnavailableError flips the whole
     *  import to inline-image mode (and drops audio). */
    async function uploadDeckMedia(
      deckId: string,
      imageFiles: string[],
      audioFiles: string[],
      onOne: () => void,
    ): Promise<{ images: Map<string, string>; audio: Map<string, string> }> {
      const images = new Map<string, string>();
      const audio = new Map<string, string>();

      await runPool(imageFiles, 4, async (fn) => {
        try {
          const bytes = await rawMediaBytes(fn);
          if (!bytes) return;
          const mime = mimeFromName(fn);
          if (storageOk && uid) {
            try {
              const resized = await resizeImageBlob(new Blob([new Uint8Array(bytes)], { type: mime }));
              const path = `${uid}/${deckId}/${sanitizeSegment(fn)}`;
              await uploadMedia(path, resized.blob, resized.contentType);
              images.set(fn, `kioku-media://${path}`);
              mediaBytes += resized.blob.size;
              mediaCount += 1;
              return;
            } catch (e) {
              if (e instanceof StorageUnavailableError) storageOk = false;
              // otherwise a per-file failure: fall through to the inline fallback
            }
          }
          try {
            images.set(fn, await resizedDataUrl(new Blob([new Uint8Array(bytes)]), mime));
            mediaCount += 1;
          } catch {
            try {
              images.set(fn, `data:${mime};base64,${bytesToBase64(bytes)}`);
              mediaCount += 1;
            } catch {
              /* give up on this image */
            }
          }
        } finally {
          onOne();
        }
      });

      await runPool(audioFiles, 4, async (fn) => {
        try {
          if (!storageOk || !uid) {
            audioDropped = true;
            return;
          }
          const bytes = await rawMediaBytes(fn);
          if (!bytes) return;
          try {
            const path = `${uid}/${deckId}/${sanitizeSegment(fn)}`;
            const blob = new Blob([new Uint8Array(bytes)], { type: mimeFromName(fn) });
            await uploadMedia(path, blob, mimeFromName(fn));
            audio.set(fn, `kioku-audio://${path}`);
            mediaBytes += blob.size;
            mediaCount += 1;
            audioImported += 1;
          } catch (e) {
            if (e instanceof StorageUnavailableError) storageOk = false;
            audioDropped = true;
          }
        } finally {
          onOne();
        }
      });

      return { images, audio };
    }

    // ---- collection creation day (for review-due conversion) ----------------
    const nowMs = Date.now();
    let colCrtMs = nowMs;
    try {
      const crt = Number(db.exec('SELECT crt FROM col LIMIT 1')[0]?.values[0]?.[0] ?? 0);
      if (crt > 0) colCrtMs = crt * 1000;
    } catch {
      /* keep now */
    }

    // ---- Anki deck names (id -> full "::"-path name) ------------------------
    // Each card's `did` points to an Anki deck; col.decks maps those ids to full
    // hierarchical names. One Kioku deck is created per non-empty Anki (sub)deck,
    // carrying its full path so the UI can nest it. Parent decks with no cards of
    // their own become grouping nodes in the tree (derived from the paths).
    const deckNameById = new Map<string, string>();
    // New schema (collection.anki21b): decks live in a `decks` table and the
    // name column uses the 0x1f unit separator between hierarchy levels, so we
    // normalize it to "::" so subdecks nest in the tree.
    try {
      const rows = db.exec('SELECT id, name FROM decks')[0]?.values ?? [];
      for (const [id, name] of rows) {
        if (typeof name === 'string' && name) {
          deckNameById.set(String(id), name.replace(/\x1f/g, '::'));
        }
      }
    } catch {
      /* no decks table -> legacy col.decks JSON below */
    }
    // Legacy schema (anki2/anki21): decks are a JSON blob on col, names use "::".
    if (deckNameById.size === 0) {
      try {
        const raw = db.exec('SELECT decks FROM col LIMIT 1')[0]?.values[0]?.[0];
        if (typeof raw === 'string') {
          const obj = JSON.parse(raw) as Record<string, { name?: string }>;
          for (const [id, d] of Object.entries(obj)) {
            if (d?.name) deckNameById.set(id, d.name);
          }
        }
      } catch {
        /* fall back to the filename below */
      }
    }
    const fallbackName =
      fileName.replace(/\.apkg$/i, '').replace(/\.colpkg$/i, '') || 'Deck importado';

    // ---- cards (joined to their note + Anki deck id) with scheduling --------
    let cardRows: unknown[][] = [];
    try {
      cardRows =
        db.exec(
          'SELECT c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.data, n.flds, c.did, c.ord, n.mid ' +
            'FROM cards c JOIN notes n ON c.nid = n.id',
        )[0]?.values ?? [];
    } catch {
      /* fall through to notes-only */
    }
    if (cardRows.length === 0) {
      // No cards table (or query failed): import notes as fresh "new" cards.
      const noteVals = db.exec('SELECT flds FROM notes')[0]?.values ?? [];
      cardRows = noteVals.map((v) => [0, 0, 0, 0, 0, 0, 0, '', v[0], '', 0, '']);
    }

    // "Type in the answer" templates: their question uses {{type:Field}}. Collect
    // the (notetype id, template ord) pairs so we can tag those cards on import.
    const typeInKeys = new Set<string>();
    try {
      // New schema: the qfmt lives in a protobuf `config` blob, but the literal
      // "{{type:" survives as UTF-8 bytes we can scan for.
      const rows = db.exec('SELECT ntid, ord, config FROM templates')[0]?.values ?? [];
      for (const [ntid, ord, config] of rows) {
        const bytes = config instanceof Uint8Array ? config : new Uint8Array();
        if (new TextDecoder('utf-8', { fatal: false }).decode(bytes).includes('{{type:')) {
          typeInKeys.add(`${ntid}:${ord}`);
        }
      }
    } catch {
      /* legacy col.models below */
    }
    if (typeInKeys.size === 0) {
      try {
        const raw = db.exec('SELECT models FROM col LIMIT 1')[0]?.values[0]?.[0];
        if (typeof raw === 'string') {
          const models = JSON.parse(raw) as Record<string, { tmpls?: Array<{ qfmt?: string }> }>;
          for (const [mid, model] of Object.entries(models)) {
            (model.tmpls ?? []).forEach((t, ord) => {
              if (typeof t.qfmt === 'string' && t.qfmt.includes('{{type:')) {
                typeInKeys.add(`${mid}:${ord}`);
              }
            });
          }
        }
      } catch {
        /* no type-in templates detected */
      }
    }
    if (cardRows.length === 0) throw new Error('Nenhuma nota encontrada no arquivo.');

    // Group rows by their Anki deck id so each (sub)deck becomes its own deck.
    const rowsByDid = new Map<string, unknown[][]>();
    for (const row of cardRows) {
      const did = String(row[9] ?? '');
      const arr = rowsByDid.get(did);
      if (arr) arr.push(row);
      else rowsByDid.set(did, [row]);
    }

    const settings = await repo.getSettings();
    let colorIdx = Math.floor(Math.random() * DECK_COLORS.length);

    // ---- phase 1: parse every (sub)deck's cards (no deck creation, no media) --
    interface CardPlan {
      front: string;
      back: string;
      frontSounds: string[];
      backSounds: string[];
      sched: MappedScheduling;
    }
    interface DeckPlan {
      fullName: string;
      prepared: CardPlan[];
      imageFiles: string[];
      audioFiles: string[];
    }
    const plans: DeckPlan[] = [];
    for (const [did, rows] of rowsByDid) {
      const prepared: CardPlan[] = [];
      for (const row of rows) {
        const flds = String(row[8] ?? '');
        const rawFields = flds.split(FIELD_SEP);

        let front: string;
        let back: string;
        let frontSounds: string[];
        let backSounds: string[];
        // Cloze note: a field carries {{cN::...}} markers. Render the card for its
        // ordinal: blank the active cloze on the front, reveal it on the back.
        // Image filenames stay as-is here and are rewritten after the deck exists.
        const clozeIdx = rawFields.findIndex((f) => /\{\{c\d+::/.test(f));
        if (clozeIdx >= 0) {
          const nums = clozeNumbers(rawFields[clozeIdx]);
          const ord = Number(row[10] ?? 0);
          const active = nums[ord] ?? nums[0] ?? 1;
          const clozeField = rawFields[clozeIdx];
          const extras = rawFields
            .filter((_, i) => i !== clozeIdx)
            .filter((f) => f.trim().length > 0);
          const extraHtml = extras.join('<hr>');
          front = cleanAnkiMarkup(clozeKeepActive(clozeField, active));
          back = extras.length ? cleanAnkiMarkup(extraHtml) : '';
          frontSounds = soundFilesIn(clozeField);
          backSounds = soundFilesIn(extraHtml);
        } else {
          const fields = rawFields.map((f) => cleanAnkiMarkup(f));
          front = cleanAnkiMarkup(fields[0] ?? '');
          const rest = fields.slice(1).filter((f) => f.trim().length > 0);
          back = cleanAnkiMarkup(rest.join('<hr>'));
          frontSounds = soundFilesIn(rawFields[0] ?? '');
          backSounds = soundFilesIn(rawFields.slice(1).join(' '));
          // Tag "type in the answer" cards (need a back to type against).
          const mid = String(row[11] ?? '');
          const ord = Number(row[10] ?? 0);
          if (typeInKeys.has(`${mid}:${ord}`) && rest.length > 0) {
            front = markTypeIn(front);
          }
        }
        if (!stripHtml(front) && !stripHtml(back)) continue;
        const sched = mapScheduling(
          Number(row[0] ?? 0),
          Number(row[1] ?? 0),
          Number(row[2] ?? 0),
          Number(row[3] ?? 0),
          Number(row[4] ?? 0),
          Number(row[5] ?? 0),
          Number(row[6] ?? 0),
          String(row[7] ?? ''),
          colCrtMs,
          nowMs,
        );
        prepared.push({ front, back, frontSounds, backSounds, sched });
      }
      if (prepared.length === 0) continue; // empty Anki (sub)deck -> grouping node only

      const imageSet = new Set<string>();
      const audioSet = new Set<string>();
      for (const p of prepared) {
        imgSrcsIn(p.front).forEach((s) => imageSet.add(s));
        imgSrcsIn(p.back).forEach((s) => imageSet.add(s));
        p.frontSounds.forEach((s) => audioSet.add(s));
        p.backSounds.forEach((s) => audioSet.add(s));
      }
      plans.push({
        fullName: deckNameById.get(did) || fallbackName,
        prepared,
        imageFiles: [...imageSet],
        audioFiles: [...audioSet],
      });
    }

    if (plans.length === 0) {
      throw new Error('As notas não tinham conteúdo de texto reconhecível.');
    }

    // ---- name-collision check (BEFORE any deck/media is created) -------------
    // Each plan would create a deck whose full path name is plan.fullName. An
    // existing deck's full path name is settings.deckPaths[id] (when imported with
    // a hierarchy) or its plain name. If any planned name matches an existing one
    // (case-insensitive, trimmed), ask the caller what to do — replace, keep both,
    // or cancel — and apply that single choice to ALL colliding decks.
    const nameKey = (s: string) => s.trim().toLowerCase();
    const existingIdsByName = new Map<string, string[]>();
    for (const d of await repo.listDecks()) {
      const fullName = settings.deckPaths?.[d.id] ?? d.name;
      const k = nameKey(fullName);
      const arr = existingIdsByName.get(k);
      if (arr) arr.push(d.id);
      else existingIdsByName.set(k, [d.id]);
    }
    const collidingNames: string[] = [];
    const seenCollision = new Set<string>();
    for (const plan of plans) {
      const k = nameKey(plan.fullName);
      if (existingIdsByName.has(k) && !seenCollision.has(k)) {
        seenCollision.add(k);
        collidingNames.push(plan.fullName);
      }
    }

    if (collidingNames.length > 0) {
      const choice = onCollision ? await onCollision(collidingNames) : 'separate';
      if (choice === 'cancel') throw new ImportCancelledError();
      if (choice === 'replace') {
        // Delete EVERY existing deck whose name matches a colliding plan (handles
        // pre-existing duplicates → leaves exactly one clean deck after import).
        const idsToDelete = new Set<string>();
        for (const name of collidingNames) {
          for (const id of existingIdsByName.get(nameKey(name)) ?? []) idsToDelete.add(id);
        }
        for (const id of idsToDelete) {
          if (signal?.aborted) throw new ImportCancelledError();
          await repo.deleteDeck(id); // cascades cards + review_logs
        }
        // deleteDeck doesn't touch settings, so prune the deleted decks' deckPaths/
        // deckAudio entries from the in-memory settings. The final saveSettings
        // below rewrites both maps wholesale, so pruning here keeps the replaced
        // decks from leaving orphaned settings entries behind.
        const prune = <T>(m?: Record<string, T>): Record<string, T> | undefined => {
          if (!m) return m;
          const out: Record<string, T> = {};
          for (const [k, v] of Object.entries(m)) if (!idsToDelete.has(k)) out[k] = v;
          return out;
        };
        settings.deckPaths = prune(settings.deckPaths);
        settings.deckAudio = prune(settings.deckAudio);
      }
      // 'separate' → fall through and import as new decks (legacy behavior).
    }

    const mediaTotal = plans.reduce((n, p) => n + p.imageFiles.length + p.audioFiles.length, 0);
    let mediaDone = 0;

    // ---- phase 2: create each deck, upload its media, then build its cards ----
    const created: Array<{ id: string; path: string; cards: Card[] }> = [];
    for (const plan of plans) {
      if (signal?.aborted) throw new ImportCancelledError();
      const color = DECK_COLORS[colorIdx++ % DECK_COLORS.length];
      // Preserve the source schedule: keep the deck on the algorithm whose fields
      // we actually imported. A classic Anki deck (SM-2) ships no FSRS memory
      // state, so forcing it onto FSRS would discard the ease/interval we mapped
      // and reschedule every card from empty state. Use FSRS only when the
      // collection genuinely carried FSRS memory state.
      const usesFsrs = plan.prepared.some((p) => p.sched.fsrs !== undefined);
      const deck = await repo.createDeck({
        name: leafName(plan.fullName), // clean leaf label; full path lives in settings
        color,
        category: 'Importado',
        algorithm: usesFsrs ? 'fsrs' : 'sm2',
        newPerDay: settings.newPerDay,
        reviewsPerDay: settings.reviewsPerDay,
        desiredRetention: settings.defaultDesiredRetention,
        buttonCount: 4,
      });
      createdDeckIds.push(deck.id);

      const { images: imageRefs, audio: audioRefs } = await uploadDeckMedia(
        deck.id,
        plan.imageFiles,
        plan.audioFiles,
        () => {
          if (signal?.aborted) throw new ImportCancelledError();
          mediaDone += 1;
          onProgress?.({ phase: 'mídia', done: mediaDone, total: mediaTotal });
        },
      );

      const cards = plan.prepared.map((p) => {
        let front = rewriteImgs(p.front, imageRefs);
        let back = rewriteImgs(p.back, imageRefs);
        // Attach imported audio as chips on the side its [sound:] came from. The
        // deck is created with audio OFF (below), so these stay hidden until the
        // user enables audio in the deck settings.
        for (const s of p.frontSounds) {
          const ref = audioRefs.get(s);
          if (ref) front += audioChip(ref, s);
        }
        for (const s of p.backSounds) {
          const ref = audioRefs.get(s);
          if (ref) back += audioChip(ref, s);
        }
        const base = makeCard({ deckId: deck.id, front, back });
        return {
          ...base,
          state: p.sched.state,
          due: p.sched.due,
          sm2: p.sched.sm2,
          fsrs: p.sched.fsrs ?? base.fsrs,
        };
      });

      created.push({ id: deck.id, path: plan.fullName, cards });
    }

    await repo.bulkInsertCards(created.flatMap((d) => d.cards));

    // Persist the hierarchical paths + start imported decks with audio OFF, in a
    // single settings write (deckPaths drives the nested tree at runtime).
    const deckPaths = { ...(settings.deckPaths ?? {}) };
    const deckAudio = { ...(settings.deckAudio ?? {}) };
    for (const d of created) {
      deckPaths[d.id] = d.path;
      deckAudio[d.id] = false;
    }
    await repo.saveSettings({ deckPaths, deckAudio });

    // Surface what happened with media, in pt-BR.
    if (!storageOk) {
      warnings.push(
        'Armazenamento de mídia indisponível: as imagens foram embutidas no card e o áudio não ' +
          'foi importado. Rode db/storage-setup.sql no Supabase para habilitar a mídia na nuvem.',
      );
    } else if (audioImported > 0) {
      warnings.push(
        'Áudio importado e desligado por padrão. Ative em Configurações do deck para ouvir.',
      );
    }
    if (storageOk && audioDropped) {
      warnings.push('Parte do áudio não pôde ser importada.');
    }
    // Track Storage usage and warn near the free-tier limit after a big import.
    if (storageOk && mediaBytes > 0) {
      try {
        warnIfStorageHigh(await recordStorageUpload(mediaBytes));
      } catch {
        /* usage bookkeeping is best-effort */
      }
    }

    const totalCards = created.reduce((n, d) => n + d.cards.length, 0);
    // Open the biggest deck from the success dialog.
    const primary = created.reduce((a, b) => (b.cards.length > a.cards.length ? b : a));
    return {
      deckId: primary.id,
      deckName: leafName(primary.path),
      deckCount: created.length,
      cardCount: totalCards,
      mediaCount,
      warnings,
    };
  } catch (err) {
    if (err instanceof ImportCancelledError) {
      // Roll back the decks created before the cancel (their cards were never
      // inserted), so nothing half-imported is left behind.
      for (const id of createdDeckIds) {
        try {
          await repo.deleteDeck(id);
        } catch {
          /* best-effort rollback */
        }
      }
    }
    throw err;
  } finally {
    db.close();
  }
}
