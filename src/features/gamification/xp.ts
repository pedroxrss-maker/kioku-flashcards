/**
 * The XP/level model — the one place to tune gamification numbers.
 *
 * `XP_REWARDS` is how much XP each action is worth; the level curve below maps a
 * running XP total to a level. Both the rewards and the curve are pure data +
 * pure functions (no DB, no React), so they're trivial to unit-test and tweak.
 *
 * Phase 1 wires only `reviewCard` (awarded once per card rated, summed at the
 * end of a study session). The other rewards are defined but not yet granted.
 */

/** XP granted per action. Reviewing a card is the only one awarded in Phase 1. */
export const XP_REWARDS = {
  /** Per card rated in a review session. */
  reviewCard: 10,
  // --- defined for later phases, not yet awarded ---
  // createCard: 5,
  // createDeck: 25,
  // sessionComplete: 20,
  // dailyGoalMet: 50,
} as const;

// ── Level curve (tunable) ────────────────────────────────────────────────────
// Cumulative XP to REACH a level grows as BASE * (level - 1) ** GROWTH:
//   L2 = 100 XP, L3 ≈ 283, L5 ≈ 800, L10 ≈ 2700. Early levels are quick, then
//   the curve tapers. With reviewCard = 10 that's ~10 cards to L2, ~80 to L5.
const LEVEL_BASE = 100;
const LEVEL_GROWTH = 1.5;

/** Total cumulative XP required to BE at `level` (level 1 = 0 XP). */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(LEVEL_BASE * (level - 1) ** LEVEL_GROWTH);
}

/** The level for a given total XP (the highest level whose threshold is met). */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (xpToReachLevel(level + 1) <= totalXp) level += 1;
  return level;
}

/** Progress inside the current level — for a future XP bar. `current`/`needed`
 *  are XP into / across the current level; `pct` is 0..1. */
export interface LevelProgress {
  level: number;
  current: number;
  needed: number;
  pct: number;
  totalXp: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelForXp(totalXp);
  const floor = xpToReachLevel(level);
  const ceil = xpToReachLevel(level + 1);
  const current = totalXp - floor;
  const needed = ceil - floor;
  return { level, current, needed, pct: needed ? current / needed : 0, totalXp };
}
