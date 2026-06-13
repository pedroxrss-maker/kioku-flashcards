import { describe, expect, it } from 'vitest';
import { buttonsFor } from './buttons';

describe('King of Buttons', () => {
  it('4 buttons are filled with contrast-aware text colors', () => {
    const four = buttonsFor(4);
    expect(four.map((b) => b.label)).toEqual(['Errei', 'Difícil', 'Bom', 'Fácil']);
    expect(four.map((b) => b.rating)).toEqual(['again', 'hard', 'good', 'easy']);
    // Errei (red) + Fácil (blue) -> white text; Difícil (amber) + Bom (green) -> dark text.
    expect(four[0].text).toBe('#ffffff');
    expect(four[1].text).toBe('#0a0a0a');
    expect(four[2].text).toBe('#0a0a0a');
    expect(four[3].text).toBe('#ffffff');
  });

  it('2 and 3 button layouts map onto the four ratings', () => {
    expect(buttonsFor(2).map((b) => b.rating)).toEqual(['again', 'good']);
    expect(buttonsFor(3).map((b) => b.rating)).toEqual(['again', 'hard', 'good']);
  });
});
