import JSZip from 'jszip';
import { repo } from '../../db/repositories';
import { DECK_COLORS, makeCard } from '../../db/factories';
import { MEDIA_PROTOCOL } from '../media/media';
import { stripHtml } from '../../lib/text';
import { mimeFromName } from './mime';
import { loadSqlJs } from './sqljs';
import type { Card } from '../../db/types';

// Anki separates note fields with the Unit Separator control char (0x1f).
const FIELD_SEP = String.fromCharCode(0x1f);

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

export interface ImportResult {
  deckId: string;
  deckName: string;
  cardCount: number;
  mediaCount: number;
  warnings: string[];
}

/**
 * Import an Anki `.apkg` (zip of a SQLite collection + media map). Parses notes,
 * creates one Kioku deck of `new` cards, and rewrites `<img src>` media to
 * imported MediaBlobs. Scheduling is reset to `new` (Anki scheduling is not
 * translated).
 */
export async function importApkg(file: File): Promise<ImportResult> {
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(file);

  const collEntry =
    zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!collEntry) {
    if (zip.file('collection.anki21b')) {
      throw new Error(
        'Este .apkg usa o formato novo comprimido (anki21b). No Anki, exporte ' +
          'marcando “Support older Anki versions (slower/larger files)”.',
      );
    }
    throw new Error('Coleção (collection.anki2) não encontrada no arquivo.');
  }

  const dbBytes = await collEntry.async('uint8array');
  const SQL = await loadSqlJs();
  const db = new SQL.Database(dbBytes);

  try {
    // ---- media map: { "0": "image.jpg", ... } -> filename -> zip entry key ---
    const fileByName = new Map<string, string>();
    const mediaEntry = zip.file('media');
    if (mediaEntry) {
      try {
        const map = JSON.parse(await mediaEntry.async('string')) as Record<string, string>;
        for (const [num, name] of Object.entries(map)) fileByName.set(name, num);
      } catch {
        warnings.push('Mapa de mídia inválido — imagens podem não aparecer.');
      }
    }

    const mediaCache = new Map<string, string | null>(); // filename -> kioku id
    let mediaCount = 0;

    async function ensureMedia(filename: string): Promise<string | null> {
      if (mediaCache.has(filename)) return mediaCache.get(filename) ?? null;
      const key =
        fileByName.get(filename) ?? fileByName.get(decodeURIComponent(filename));
      const entry = key ? zip.file(key) : null;
      if (!entry) {
        mediaCache.set(filename, null);
        return null;
      }
      const raw = await entry.async('blob');
      const mime = mimeFromName(filename);
      const data = raw.slice(0, raw.size, mime); // retype the blob
      const id = crypto.randomUUID();
      await repo.putMedia({ id, mime, data, createdAt: Date.now() });
      mediaCache.set(filename, id);
      mediaCount += 1;
      return id;
    }

    async function rewriteMedia(html: string): Promise<string> {
      if (!html.includes('<img')) return html;
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      const imgs = Array.from(doc.querySelectorAll('img'));
      await Promise.all(
        imgs.map(async (img) => {
          const src = img.getAttribute('src');
          if (!src) return;
          const id = await ensureMedia(src);
          if (id) img.setAttribute('src', `${MEDIA_PROTOCOL}${id}`);
        }),
      );
      return doc.body.innerHTML;
    }

    // ---- deck name from col.decks JSON (fallback: filename) -----------------
    let deckName =
      file.name.replace(/\.apkg$/i, '').replace(/\.colpkg$/i, '') ||
      'Deck importado';
    try {
      const colRes = db.exec('SELECT decks FROM col LIMIT 1');
      const raw = colRes[0]?.values[0]?.[0];
      if (typeof raw === 'string') {
        const decks = JSON.parse(raw) as Record<string, { name?: string }>;
        const names = Object.values(decks)
          .map((d) => d.name)
          .filter((n): n is string => !!n && n !== 'Default');
        if (names.length === 1) deckName = names[0];
      }
    } catch {
      /* keep filename fallback */
    }

    // ---- notes -------------------------------------------------------------
    const notesRes = db.exec('SELECT flds FROM notes');
    const rows = notesRes[0]?.values ?? [];
    if (rows.length === 0) throw new Error('Nenhuma nota encontrada no arquivo.');

    const settings = await repo.getSettings();
    const color = DECK_COLORS[Math.floor(Math.random() * DECK_COLORS.length)];
    const deck = await repo.createDeck({
      name: deckName,
      color,
      category: 'Importado',
      algorithm: settings.defaultAlgorithm,
      newPerDay: settings.newPerDay,
      reviewsPerDay: settings.reviewsPerDay,
      desiredRetention: settings.defaultDesiredRetention,
      buttonCount: settings.defaultButtonCount,
    });

    const cards: Card[] = [];
    for (const row of rows) {
      const flds = String(row[0] ?? '');
      // Clean each field first so a field that was only [sound:...] becomes
      // empty and is dropped (no stray <hr> separators left behind).
      const fields = flds.split(FIELD_SEP).map((f) => cleanAnkiMarkup(f));
      // Belt-and-suspenders: clean again on the EXACT strings we save, after any
      // media rewrite, so no [sound:...] / Anki markup can survive to the card.
      const front = cleanAnkiMarkup(await rewriteMedia(fields[0] ?? ''));
      const rest = fields.slice(1).filter((f) => f.trim().length > 0);
      const back = cleanAnkiMarkup(await rewriteMedia(rest.join('<hr>')));
      if (!stripHtml(front) && !stripHtml(back)) continue;
      cards.push(makeCard({ deckId: deck.id, front, back }));
    }

    // TEMP (verification): confirm the sanitize ran on the strings being saved.
    // Remove once you've checked the console during an import.
    if (cards[0]) {
      const leaked = cards.filter(
        (c) => /\[sound:/i.test(c.front) || /\[sound:/i.test(c.back),
      ).length;
      // eslint-disable-next-line no-console
      console.log(
        '[apkg import] sample front at save:',
        JSON.stringify(cards[0].front),
        '| cards still containing [sound:]:',
        leaked,
      );
    }

    if (cards.length === 0) {
      await repo.deleteDeck(deck.id);
      throw new Error('As notas não tinham conteúdo de texto reconhecível.');
    }

    await repo.bulkInsertCards(cards);

    return {
      deckId: deck.id,
      deckName,
      cardCount: cards.length,
      mediaCount,
      warnings,
    };
  } finally {
    db.close();
  }
}
