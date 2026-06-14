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
    deckGen: { period: 'day', limit: 6 },
    tutor: { period: 'day', limit: 20 },
    image: { period: 'month', limit: 0 }, // free: no AI images
    audio: { period: 'month', limit: -1 }, // audio allowed for everyone
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
