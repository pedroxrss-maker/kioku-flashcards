import type { ButtonCount, Rating } from '../../db/types';

export interface ButtonDef {
  rating: Rating;
  label: string;
  color: string;
}

/**
 * King of Buttons — maps the visible buttons onto the four internal ratings
 * based on `deck.buttonCount`. The four ratings always exist internally; only
 * the visible buttons (and their labels/colors) change.
 */
export function buttonsFor(count: ButtonCount): ButtonDef[] {
  const errei: ButtonDef = { rating: 'again', label: 'Errei', color: 'var(--accent)' };
  const dificil: ButtonDef = { rating: 'hard', label: 'Difícil', color: 'var(--accent-amber)' };
  const bom: ButtonDef = { rating: 'good', label: 'Bom', color: 'var(--fg)' };
  const facil: ButtonDef = { rating: 'easy', label: 'Fácil', color: 'var(--accent-green)' };
  const acertei: ButtonDef = { rating: 'good', label: 'Acertei', color: 'var(--accent-green)' };

  if (count === 2) return [errei, acertei];
  if (count === 3) return [errei, dificil, acertei];
  return [errei, dificil, bom, facil];
}
