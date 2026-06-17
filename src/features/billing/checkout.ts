/**
 * Kiwify checkout: the single source of truth for mapping a (plan, billing cycle)
 * to its Kiwify pay link and injecting the buyer email, plus the "checkout
 * intent" that survives the signup/login redirect.
 *
 * Centralizing it means the email param name and the links change in ONE place if
 * Kiwify ever wants something different.
 */

export type PaidPlan = 'basic' | 'advanced';
export type BillingCycle = 'monthly' | 'annual';

/** The 4 Kiwify checkout links, indexed [plan][cycle]. */
const CHECKOUT_LINKS: Record<PaidPlan, Record<BillingCycle, string>> = {
  basic: {
    monthly: 'https://pay.kiwify.com.br/dzaX3IL',
    annual: 'https://pay.kiwify.com.br/vzou6fl',
  },
  advanced: {
    monthly: 'https://pay.kiwify.com.br/b0NzTPr',
    annual: 'https://pay.kiwify.com.br/1nLz295',
  },
};

/** Query-param name Kiwify reads for the buyer email. Change here if it differs. */
const EMAIL_PARAM = 'email';

/**
 * Build the checkout URL for a (plan, cycle), optionally injecting the user's
 * email so the purchase matches the webhook. URL/searchParams URL-encodes the
 * email. Without an email, returns the bare link.
 */
export function checkoutUrl(plan: PaidPlan, cycle: BillingCycle, email?: string | null): string {
  const base = CHECKOUT_LINKS[plan][cycle];
  if (!email) return base;
  const url = new URL(base);
  url.searchParams.set(EMAIL_PARAM, email);
  return url.toString();
}

// ── Checkout intent (survives the signup/login redirect) ─────────────────────
// A logged-out user who taps "Assinar" has their choice parked here; once they
// authenticate, CheckoutIntentRedirect reads it and sends them to checkout.

export interface CheckoutIntent {
  plan: PaidPlan;
  cycle: BillingCycle;
}

const INTENT_KEY = 'kioku:checkoutIntent';
/** Older than this (e.g. abandoned long ago) never auto-redirects. */
const INTENT_TTL_MS = 60 * 60 * 1000; // 60 min

interface StoredIntent extends CheckoutIntent {
  ts: number;
}

function isPaidPlan(v: unknown): v is PaidPlan {
  return v === 'basic' || v === 'advanced';
}
function isCycle(v: unknown): v is BillingCycle {
  return v === 'monthly' || v === 'annual';
}

/**
 * Remember the plan+cycle a logged-out user chose, before sending them to auth.
 * localStorage (not sessionStorage) so it survives the email-confirmation round
 * trip (often a new tab/session).
 */
export function setCheckoutIntent(plan: PaidPlan, cycle: BillingCycle): void {
  try {
    const stored: StoredIntent = { plan, cycle, ts: Date.now() };
    localStorage.setItem(INTENT_KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable (private mode): the user can just click again after auth */
  }
}

/**
 * Read AND clear the stored intent (consume-once). Returns null when there is
 * none, it is malformed, or it is older than the TTL.
 */
export function consumeCheckoutIntent(): CheckoutIntent | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(INTENT_KEY);
    if (raw) localStorage.removeItem(INTENT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredIntent>;
    if (typeof v.ts !== 'number' || Date.now() - v.ts > INTENT_TTL_MS) return null;
    if (isPaidPlan(v.plan) && isCycle(v.cycle)) return { plan: v.plan, cycle: v.cycle };
  } catch {
    /* malformed JSON: ignore */
  }
  return null;
}
