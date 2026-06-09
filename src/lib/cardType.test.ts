import { describe, expect, it } from 'vitest';
import {
  cardTypeOf,
  markTypeIn,
  normalizeAnswer,
  stripTypeInMark,
} from './cardType';

describe('cardType', () => {
  it('detects basic, cloze and type-in from the stored front', () => {
    expect(cardTypeOf('Front text')).toBe('basic');
    expect(cardTypeOf('A {{c1::word}} here')).toBe('cloze');
    expect(cardTypeOf(markTypeIn('Translate: cat'))).toBe('typein');
  });

  it('markTypeIn is idempotent and stripTypeInMark reverses it', () => {
    const once = markTypeIn('Q');
    expect(markTypeIn(once)).toBe(once); // no double marker
    expect(stripTypeInMark(once)).toBe('Q');
  });

  it('cloze takes precedence over a stray type-in marker', () => {
    expect(cardTypeOf(markTypeIn('{{c1::x}}'))).toBe('cloze');
  });

  it('normalizeAnswer trims, collapses spaces and casefolds', () => {
    expect(normalizeAnswer('  Le   CHAT ')).toBe('le chat');
    expect(normalizeAnswer('Le chat')).toBe(normalizeAnswer('le  chat'));
  });
});
