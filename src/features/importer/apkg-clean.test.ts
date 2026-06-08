import { describe, it, expect } from 'vitest';
import { cleanAnkiMarkup } from './apkg-import';

describe('cleanAnkiMarkup', () => {
  it('strips [sound:...] tags entirely (case-insensitive)', () => {
    expect(cleanAnkiMarkup('Hello [sound:nf_M2-4_Finding_the_Gate_001.mp3]')).toBe('Hello');
    expect(cleanAnkiMarkup('[SOUND:a.mp3]word')).toBe('word');
  });

  it('strips multiple sound tags and leftover [anki:...]', () => {
    expect(cleanAnkiMarkup('a [sound:x.mp3] b [sound:y.ogg] [anki:foo]')).toBe('a b');
  });

  it('collapses double spaces left behind and trims', () => {
    expect(cleanAnkiMarkup('a  [sound:x.mp3]  b')).toBe('a b');
  });

  it('drops leading/trailing <br> left behind', () => {
    expect(cleanAnkiMarkup('<br>[sound:x.mp3]<br>texto<br>')).toBe('texto');
  });

  it('leaves clean text untouched', () => {
    expect(cleanAnkiMarkup('Apenas texto limpo')).toBe('Apenas texto limpo');
  });
});
