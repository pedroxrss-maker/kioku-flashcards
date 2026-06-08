import JSZip from 'jszip';
import { decompress } from 'fzstd';
import { repo } from '../../db/repositories';
import { DECK_COLORS, makeCard } from '../../db/factories';
import { leafName } from '../../lib/deckTree';
import { stripHtml } from '../../lib/text';
import { mimeFromName } from './mime';
import { loadSqlJs } from './sqljs';
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
 * text, and tidy the leftover whitespace. Audio is NOT imported yet — the
 * `[sound:...]` token is simply removed. (`<img>` media is handled separately by
 * rewriteMedia, so raw image filenames never reach the card as text.)
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

interface MappedScheduling {
  state: CardState;
  due: number;
  sm2: Sm2Fields;
  fsrs?: FsrsFields; // override only when Anki carried FSRS memory state
}

/**
 * Translate one Anki card's scheduling (cards table row) into Kioku fields, so
 * the user keeps studying where they left off. Best-effort.
 */
function mapScheduling(
  type: number,
  queue: number,
  due: number,
  ivl: number,
  factor: number,
  reps: number,
  lapses: number,
  data: string,
  colCrtMs: number,
  nowMs: number,
): MappedScheduling {
  // state: type 0=new, 1=learning, 2=review, 3=relearning. queue<0 = suspended/
  // buried -> treat as new (inactive).
  let state: CardState;
  if (queue < 0) state = 'new';
  else if (type === 1) state = 'learning';
  else if (type === 2) state = 'review';
  else if (type === 3) state = 'relearning';
  else state = 'new';

  // Real due datetime. Review due is a day number relative to col.crt; learning
  // due is an epoch timestamp (seconds); new cards are due now.
  let dueMs: number;
  if (type === 2) dueMs = colCrtMs + due * DAY;
  else if (type === 1 || type === 3) dueMs = due > 1e9 ? due * 1000 : colCrtMs + due * DAY;
  else dueMs = nowMs;

  // SM-2 fields (Anki factor is e.g. 2500 -> ease 2.5; ivl in days, <0 = seconds).
  const sm2: Sm2Fields = {
    ease: factor > 0 ? factor / 1000 : 2.5,
    intervalDays: Math.max(0, ivl),
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
        elapsedDays: 0,
        scheduledDays: Math.max(0, ivl),
        reps,
        lapses,
        lastReview: state === 'new' ? null : nowMs,
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
 * scheduling is preserved best-effort, `<img>` media is embedded inline.
 * Audio/compressed media is intentionally skipped for now.
 */
export async function importApkg(file: File): Promise<ImportResult> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(file);

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

  try {
    // ---- media map (manifest may itself be zstd-compressed in v3) -----------
    const fileByName = new Map<string, string>();
    try {
      const mediaBytes = await memberBytes(zip, 'media');
      if (mediaBytes) {
        const map = JSON.parse(new TextDecoder().decode(mediaBytes)) as Record<string, string>;
        for (const [num, name] of Object.entries(map)) fileByName.set(name, num);
      }
    } catch {
      // v3 manifest can be protobuf, not JSON — media is deferred anyway.
      warnings.push('Mídia não importada (formato novo). Texto e agendamento foram importados.');
    }

    const mediaCache = new Map<string, string | null>(); // filename -> data: URL
    let mediaCount = 0;

    async function mediaDataUrl(filename: string): Promise<string | null> {
      if (mediaCache.has(filename)) return mediaCache.get(filename) ?? null;
      const key = fileByName.get(filename) ?? fileByName.get(decodeURIComponent(filename));
      const entry = key ? zip.file(key) : null;
      if (!entry) {
        mediaCache.set(filename, null);
        return null;
      }
      const bytes = await entry.async('uint8array');
      if (isZstd(bytes)) {
        // Compressed media (v3) — deferred. Skip gracefully, don't crash.
        mediaCache.set(filename, null);
        return null;
      }
      const mime = mimeFromName(filename);
      let url: string;
      try {
        url = await resizedDataUrl(new Blob([new Uint8Array(bytes)]), mime);
      } catch {
        url = `data:${mime};base64,${await entry.async('base64')}`;
      }
      mediaCache.set(filename, url);
      mediaCount += 1;
      return url;
    }

    async function rewriteMedia(html: string): Promise<string> {
      if (!html.includes('<img')) return html;
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      const imgs = Array.from(doc.querySelectorAll('img'));
      await Promise.all(
        imgs.map(async (img) => {
          const src = img.getAttribute('src');
          if (!src || src.startsWith('data:')) return;
          const url = await mediaDataUrl(src);
          if (url) img.setAttribute('src', url);
        }),
      );
      return doc.body.innerHTML;
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
    const fallbackName =
      file.name.replace(/\.apkg$/i, '').replace(/\.colpkg$/i, '') || 'Deck importado';

    // ---- cards (joined to their note + Anki deck id) with scheduling --------
    let cardRows: unknown[][] = [];
    try {
      cardRows =
        db.exec(
          'SELECT c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.data, n.flds, c.did ' +
            'FROM cards c JOIN notes n ON c.nid = n.id',
        )[0]?.values ?? [];
    } catch {
      /* fall through to notes-only */
    }
    if (cardRows.length === 0) {
      // No cards table (or query failed) — import notes as fresh "new" cards.
      const noteVals = db.exec('SELECT flds FROM notes')[0]?.values ?? [];
      cardRows = noteVals.map((v) => [0, 0, 0, 0, 0, 0, 0, '', v[0], '']);
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
    const created: Array<{ id: string; path: string; cards: Card[] }> = [];
    let colorIdx = Math.floor(Math.random() * DECK_COLORS.length);
    let mappedFirst = false;

    for (const [did, rows] of rowsByDid) {
      // Build the card content first; only create a deck if it has real cards.
      const prepared: Array<{ front: string; back: string; sched: MappedScheduling }> = [];
      for (const row of rows) {
        const flds = String(row[8] ?? '');
        const fields = flds.split(FIELD_SEP).map((f) => cleanAnkiMarkup(f));
        const front = cleanAnkiMarkup(await rewriteMedia(fields[0] ?? ''));
        const rest = fields.slice(1).filter((f) => f.trim().length > 0);
        const back = cleanAnkiMarkup(await rewriteMedia(rest.join('<hr>')));
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
        prepared.push({ front, back, sched });
      }
      if (prepared.length === 0) continue; // empty Anki (sub)deck -> grouping node only

      const fullName = deckNameById.get(did) || fallbackName;
      const color = DECK_COLORS[colorIdx++ % DECK_COLORS.length];
      const deck = await repo.createDeck({
        name: leafName(fullName), // clean leaf label; full path lives in settings
        color,
        category: 'Importado',
        algorithm: settings.defaultAlgorithm,
        newPerDay: settings.newPerDay,
        reviewsPerDay: settings.reviewsPerDay,
        desiredRetention: settings.defaultDesiredRetention,
        buttonCount: 4,
      });
      const cards = prepared.map((p) => {
        const base = makeCard({ deckId: deck.id, front: p.front, back: p.back });
        return {
          ...base,
          state: p.sched.state,
          due: p.sched.due,
          sm2: p.sched.sm2,
          fsrs: p.sched.fsrs ?? base.fsrs,
        };
      });

      // TEMP (verification): scheduling of the first imported card overall.
      if (!mappedFirst && cards[0]) {
        mappedFirst = true;
        const c = cards[0];
        // eslint-disable-next-line no-console
        console.log(
          `[apkg import] "${fullName}" first card: state=${c.state} ` +
            `due=${new Date(c.due).toISOString()} ivl=${c.sm2.intervalDays}d ease=${c.sm2.ease}`,
        );
      }

      created.push({ id: deck.id, path: fullName, cards });
    }

    if (created.length === 0) {
      throw new Error('As notas não tinham conteúdo de texto reconhecível.');
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
  } finally {
    db.close();
  }
}
