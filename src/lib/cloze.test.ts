import { describe, expect, it } from 'vitest';
import { buildClozeHtml, clozePlainText, isClozeHtml } from './cloze';

describe('cloze runtime helpers', () => {
  it('detects cloze markers', () => {
    expect(isClozeHtml('C\'est une {{c1::nouvelle}} maison.')).toBe(true);
    expect(isClozeHtml('plain card')).toBe(false);
  });

  it('wraps the marker in a reveal-in-place span holding the answer + placeholder', () => {
    const out = buildClozeHtml("C'est une {{c1::nouvelle}} maison.");
    expect(out).toBe('C\'est une <span class="cloze" data-ph="...">nouvelle</span> maison.');
  });

  it('uses the hint as the placeholder when present', () => {
    expect(buildClozeHtml('{{c1::Paris::capital}}')).toBe(
      '<span class="cloze" data-ph="capital">Paris</span>',
    );
  });

  it('plain text reveals the answer for TTS', () => {
    expect(clozePlainText('Quand on {{c1::veut}} on peut !')).toBe('Quand on veut on peut !');
  });
});
