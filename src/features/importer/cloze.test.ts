import { describe, expect, it } from 'vitest';
import { clozeKeepActive, clozeNumbers, renderClozeText } from './apkg-import';

describe('cloze rendering', () => {
  it('lists cloze numbers sorted and deduped', () => {
    expect(clozeNumbers('a {{c2::x}} b {{c1::y}} {{c1::z}}')).toEqual([1, 2]);
    expect(clozeNumbers('no cloze here')).toEqual([]);
  });

  it('blanks the active cloze on the front and reveals it on the back', () => {
    const text = 'Quand on {{c1::veut}} on peut !';
    expect(renderClozeText(text, 1, false)).toBe('Quand on [...] on peut !');
    expect(renderClozeText(text, 1, true)).toBe('Quand on <b>veut</b> on peut !');
  });

  it('shows other clozes as plain text and uses hints when present', () => {
    const text = '{{c1::Paris::capital}} is in {{c2::France}}';
    // Card for c1: c1 blanked (with hint), c2 revealed as text.
    expect(renderClozeText(text, 1, false)).toBe('[capital] is in France');
    // Card for c2: c1 shown as text, c2 blanked.
    expect(renderClozeText(text, 2, false)).toBe('Paris is in [...]');
    expect(renderClozeText(text, 2, true)).toBe('Paris is in <b>France</b>');
  });

  it('clozeKeepActive keeps the active marker and reveals the others', () => {
    const text = '{{c1::Paris}} is in {{c2::France}}';
    // The c2 card stores the c2 marker (revealed at review) with c1 already shown.
    expect(clozeKeepActive(text, 2)).toBe('Paris is in {{c2::France}}');
    expect(clozeKeepActive(text, 1)).toBe('{{c1::Paris}} is in France');
  });
});
