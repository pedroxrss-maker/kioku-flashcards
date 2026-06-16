/**
 * Freemium usage limits — central, EDITABLE source of truth for the app/UI.
 *
 * This MIRRORS the SQL function `public.quota_rules(plan)` in
 * db/usage-limits.sql (and db/full-schema.sql). The SQL copy is the one that
 * actually ENFORCES the limits (server-side, tamper-proof, via consume_quota);
 * this file is what the UI reads to show "X de Y restantes", gate buttons, etc.
 *
 * If you change a number here, change it in quota_rules() too (and vice-versa).
 *
 * Convention for `limit`:
 *   -1  -> unlimited: always allowed, not metered.
 *    0  -> always denied (e.g. images on the free plan).
 *   > 0 -> the cap for the period.
 * The `period` (day | month) is part of the rule: free is gated DAILY, the paid
 * plans are gated MONTHLY.
 */

export type Plan = 'free' | 'basic' | 'advanced';
export type UsageMetric = 'deckGen' | 'tutor' | 'image' | 'audio';
export type UsagePeriod = 'day' | 'month';

export interface QuotaRule {
  period: UsagePeriod;
  /** -1 = unlimited, 0 = always denied, >0 = cap for the period. */
  limit: number;
}

export const PLANS: Plan[] = ['free', 'basic', 'advanced'];
export const DEFAULT_PLAN: Plan = 'free';

// ── EDIT LIMITS HERE (keep in sync with quota_rules in the SQL) ──────────────
export const PLAN_LIMITS: Record<Plan, Record<UsageMetric, QuotaRule>> = {
  free: {
    deckGen: { period: 'day', limit: 2 }, // free: 2 decks com IA por dia
    tutor: { period: 'day', limit: 10 }, // free: 10 explicações do tutor por dia
    image: { period: 'month', limit: 0 }, // free: no AI images
    audio: { period: 'month', limit: 200 }, // free: 200 audios/month (paid = unlimited)
  },
  basic: {
    deckGen: { period: 'month', limit: 300 }, // soft-high
    tutor: { period: 'month', limit: 1000 }, // soft-high
    image: { period: 'month', limit: 100 },
    audio: { period: 'month', limit: -1 },
  },
  advanced: {
    deckGen: { period: 'month', limit: 1000 },
    tutor: { period: 'month', limit: 5000 },
    image: { period: 'month', limit: 300 }, // hidden cap behind "ilimitado"
    audio: { period: 'month', limit: -1 },
  },
};
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Max number of cards a single AI-generated deck may contain, by plan. This is a
 * PER-GENERATION cap (not a daily/monthly counter, so it is not in quota_rules):
 * the free plan is held to 20 cards per generated deck; paid plans use the UI
 * maximum (100). Enforced where the deck is generated (the quantity selector is
 * capped AND the result is truncated, so instructions like "faça 50 cards" can
 * never exceed it on the free plan).
 */
export const AI_DECK_MAX_CARDS: Record<Plan, number> = {
  free: 20,
  basic: 100,
  advanced: 100,
};

/** The cards-per-AI-deck cap for a plan (falls back to free). */
export const aiDeckMaxCards = (plan: Plan): number =>
  AI_DECK_MAX_CARDS[plan] ?? AI_DECK_MAX_CARDS.free;

/** pt-BR labels for the UI. */
export const PLAN_LABELS: Record<Plan, string> = {
  free: 'Gratuito',
  basic: 'Básico',
  advanced: 'Avançado',
};

export const METRIC_LABELS: Record<UsageMetric, string> = {
  deckGen: 'Geração de decks',
  tutor: 'Tutor IA',
  image: 'Imagens IA',
  audio: 'Áudio',
};

/** The rule that applies to a metric for a plan (falls back to free). */
export function quotaRule(plan: Plan, metric: UsageMetric): QuotaRule {
  return (PLAN_LIMITS[plan] ?? PLAN_LIMITS.free)[metric];
}

export const isUnlimited = (rule: QuotaRule): boolean => rule.limit < 0;
export const isBlocked = (rule: QuotaRule): boolean => rule.limit === 0;

/** Remaining for the UI: -1 when unlimited, else clamped to >= 0. */
export function remaining(rule: QuotaRule, used: number): number {
  if (rule.limit < 0) return -1;
  return Math.max(rule.limit - used, 0);
}
