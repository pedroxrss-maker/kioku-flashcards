/* ===========================================================================
   Cloze deletion support. A cloze card stores its question with the hidden
   word(s) still wrapped in Anki markers `{{cN::answer::hint}}`. At review time
   we turn the active marker into a reveal-in-place span: it shows "[hint]"
   (or "[...]") until a `.cloze-revealed` ancestor fades the real word in — no
   card flip. Works for both freshly imported and older cards.
   =========================================================================== */

/** True if the HTML still carries an Anki cloze marker. */
export function isClozeHtml(html: string): boolean {
  return /\{\{c\d+::/.test(html);
}

/** Cloze numbers present, sorted ascending & deduped (for picking the next one). */
export function clozeNumbers(text: string): number[] {
  const set = new Set<number>();
  for (const m of text.matchAll(/\{\{c(\d+)::/g)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert every cloze marker in `html` into a reveal-in-place span. The span
 * holds the real answer text (hidden via CSS) and a `data-ph` placeholder shown
 * until reveal. Non-cloze HTML is returned unchanged.
 */
export function buildClozeHtml(html: string): string {
  return html.replace(/\{\{c(\d+)::(.*?)\}\}/gs, (_m, _n: string, inner: string) => {
    const sep = inner.indexOf('::');
    const answer = sep >= 0 ? inner.slice(0, sep) : inner;
    const hint = sep >= 0 ? inner.slice(sep + 2) : '';
    return `<span class="cloze" data-ph="${esc(hint || '...')}">${answer}</span>`;
  });
}

/** Plain question/answer text of a cloze (for TTS): reveal the word, drop tags. */
export function clozePlainText(html: string): string {
  return buildClozeHtml(html)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
