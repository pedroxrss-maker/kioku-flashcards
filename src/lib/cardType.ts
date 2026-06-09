/* ===========================================================================
   Card types, derived from the stored content (no schema change):
     - cloze  : the front carries Anki cloze markers `{{cN::...}}`.
     - typein : the front carries a hidden marker span; the user must type the
                answer (the back) before revealing it.
     - basic  : everything else (front / back).
   =========================================================================== */
import { isClozeHtml } from './cloze';

export type CardType = 'basic' | 'cloze' | 'typein';

/** Invisible marker (hidden via CSS) that tags a card as "type in the answer". */
export const TYPEIN_MARK = '<span class="kioku-typein"></span>';

export function isTypeInHtml(front: string): boolean {
  return front.includes('kioku-typein');
}

export function cardTypeOf(front: string): CardType {
  if (isClozeHtml(front)) return 'cloze';
  if (isTypeInHtml(front)) return 'typein';
  return 'basic';
}

/** Prefix the front with the type-in marker (idempotent). */
export function markTypeIn(front: string): string {
  return isTypeInHtml(front) ? front : TYPEIN_MARK + front;
}

/** Remove the type-in marker (e.g. to edit the prompt). */
export function stripTypeInMark(front: string): string {
  return front.replace(/<span class="kioku-typein">\s*<\/span>/g, '');
}

/** Normalize a typed answer for comparison: trim, collapse spaces, casefold. */
export function normalizeAnswer(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}
