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
 * the answer; every other cloze is shown as its plain text on both sides —
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
 * `fsrs` is set ONLY when the collection shipped real FSRS memory state — its
 * presence is also how the importer tells an FSRS deck from a classic SM-2 one.
 */
export function mapScheduling(
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
      const ivlDays = Math.max(0, ivl);
      fsrs = {
        stability: d.s,
        difficulty: d.d,
        elapsedDays: ivlDays,
        scheduledDays: ivlDays,
        reps,
        lapses,
        // Back-date the last review to when Anki actually scheduled this card
        // (due − interval) so FSRS derives the correct elapsed time on the next
        // review. Using "now" would make every imported card look freshly
        // reviewed and shrink its next interval.
        lastReview: state === 'new' ? null : dueMs - ivlDays * DAY,
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
export async function importApkg(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
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
      const raw = await entry.async('uint8array');
      // v3 stores each media file zstd-compressed — decompress before embedding.
      const bytes = isZstd(raw) ? decompress(raw) : raw;
      const mime = mimeFromName(filename);
      let url: string;
      try {
        url = await resizedDataUrl(new Blob([new Uint8Array(bytes)]), mime);
      } catch {
        url = `data:${mime};base64,${bytesToBase64(bytes)}`;
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
    // New schema (collection.anki21b): decks live in a `decks` table and the
    // name column uses the 0x1f unit separator between hierarchy levels — we
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
      // No cards table (or query failed) — import notes as fresh "new" cards.
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
    const created: Array<{ id: string; path: string; cards: Card[] }> = [];
    let colorIdx = Math.floor(Math.random() * DECK_COLORS.length);
    let audioSeen = false;

    for (const [did, rows] of rowsByDid) {
      // Build the card content first; only create a deck if it has real cards.
      const prepared: Array<{ front: string; back: string; sched: MappedScheduling }> = [];
      for (const row of rows) {
        const flds = String(row[8] ?? '');
        if (!audioSeen && /\[sound:/i.test(flds)) audioSeen = true;
        const rawFields = flds.split(FIELD_SEP);

        let front: string;
        let back: string;
        // Cloze note: a field carries {{cN::...}} markers. Render the card for
        // its ordinal — blank the active cloze on the front, reveal on the back.
        const clozeIdx = rawFields.findIndex((f) => /\{\{c\d+::/.test(f));
        if (clozeIdx >= 0) {
          const nums = clozeNumbers(rawFields[clozeIdx]);
          const ord = Number(row[10] ?? 0);
          const active = nums[ord] ?? nums[0] ?? 1;
          const clozeHtml = await rewriteMedia(rawFields[clozeIdx]);
          const extras = rawFields
            .filter((_, i) => i !== clozeIdx)
            .filter((f) => f.trim().length > 0);
          const extraHtml = extras.length ? await rewriteMedia(extras.join('<hr>')) : '';
          // Front keeps the active cloze marker (revealed in place at review);
          // the back holds only the extra fields, shown below on reveal.
          front = cleanAnkiMarkup(clozeKeepActive(clozeHtml, active));
          back = extraHtml ? cleanAnkiMarkup(extraHtml) : '';
        } else {
          const fields = rawFields.map((f) => cleanAnkiMarkup(f));
          front = cleanAnkiMarkup(await rewriteMedia(fields[0] ?? ''));
          const rest = fields.slice(1).filter((f) => f.trim().length > 0);
          back = cleanAnkiMarkup(await rewriteMedia(rest.join('<hr>')));
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
        prepared.push({ front, back, sched });
      }
      if (prepared.length === 0) continue; // empty Anki (sub)deck -> grouping node only

      const fullName = deckNameById.get(did) || fallbackName;
      const color = DECK_COLORS[colorIdx++ % DECK_COLORS.length];
      // Preserve the source schedule: keep the deck on the algorithm whose fields
      // we actually imported. A classic Anki deck (SM-2) ships no FSRS memory
      // state, so forcing it onto FSRS would discard the ease/interval we mapped
      // and reschedule every card from an empty (stability 0) state — the cards
      // stay due (count is right) but every interval is wrong. Use FSRS only when
      // the collection genuinely carried FSRS memory state.
      const usesFsrs = prepared.some((p) => p.sched.fsrs !== undefined);
      const deck = await repo.createDeck({
        name: leafName(fullName), // clean leaf label; full path lives in settings
        color,
        category: 'Importado',
        algorithm: usesFsrs ? 'fsrs' : 'sm2',
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

    // Images are embedded inline; audio import is still pending (needs the
    // Supabase Storage media step), so flag it instead of failing silently.
    if (audioSeen) {
      warnings.push('Áudio ainda não é importado (em desenvolvimento). Imagens e texto foram importados.');
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
  } finally {
    db.close();
  }
}
