import type { ButtonCount, Rating } from '../../db/types';

export interface ButtonDef {
  rating: Rating;
  label: string;
  /** Solid fill color (the button's role color). */
  color: string;
  /** Contrast-aware text color for the fill. */
  text: string;
}

const DARK = '#0a0a0a';
const LIGHT = '#ffffff';

/**
 * King of Buttons — maps the visible buttons onto the four internal ratings
 * based on `deck.buttonCount`. The four ratings always exist internally; only
 * the visible buttons (and their labels/colors) change. Buttons are solid-filled
 * with their role color; `text` is the contrast-aware foreground.
 */
export function buttonsFor(count: ButtonCount): ButtonDef[] {
  const errei: ButtonDef = { rating: 'again', label: 'Errei', color: 'var(--accent)', text: LIGHT };
  const dificil: ButtonDef = { rating: 'hard', label: 'Difícil', color: 'var(--accent-amber)', text: DARK };
  // #00b569 green: black has ~7.9:1 contrast vs white ~2.7:1 -> dark text.
  const bom: ButtonDef = { rating: 'good', label: 'Bom', color: 'var(--accent-green)', text: DARK };
  // #1f6dff blue: white text for contrast.
  const facil: ButtonDef = { rating: 'easy', label: 'Fácil', color: 'var(--accent-blue)', text: LIGHT };
  const acertei: ButtonDef = { rating: 'good', label: 'Acertei', color: 'var(--accent-green)', text: DARK };

  if (count === 2) return [errei, acertei];
  if (count === 3) return [errei, dificil, acertei];
  return [errei, dificil, bom, facil];
}
