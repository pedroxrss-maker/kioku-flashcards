/**
 * The user's AI-image quota, read from the SAME source the usage popover uses:
 * the plan cap (PLAN_LIMITS via quotaRule) + the server `get_usage()` RPC for how
 * many were used this period. Cached under the SAME query key (`usage:{userId}`)
 * as PlanUsageBadge, so the picker's "Restam X" and the popover's "X/limit" can
 * never disagree.
 *
 * NOTE: this is the REAL, plan-based quota — not the provisional client cap
 * (IMAGE_GEN_CAP / settings.imageGenCount) in features/ai/image.ts.
 */
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../db/store';
import { useAuth } from '../auth/AuthContext';
import { isUnlimited, quotaRule, remaining as remainingOf } from './limits';

interface UsageRow {
  metric: string;
  used: number;
}

async function fetchUsage(): Promise<UsageRow[]> {
  const { data, error } = await supabase.rpc('get_usage');
  if (error) throw error;
  return (data as UsageRow[] | null) ?? [];
}

export interface ImageQuota {
  /** Plan cap for images: >0 finite, -1 unlimited, 0 blocked (e.g. free plan). */
  limit: number;
  /** Used this period (from get_usage). */
  used: number;
  /** limit - used, clamped to >= 0 for finite plans; Infinity when unlimited. */
  remaining: number;
  unlimited: boolean;
  /** No images can be generated (blocked plan, or finite cap reached). */
  atCap: boolean;
  loaded: boolean;
}

export function useImageQuota(): ImageQuota {
  const { user, plan } = useAuth();
  // Same key + RPC as PlanUsageBadge → shared cache, always consistent.
  const usage = useQuery<UsageRow[]>(`usage:${user?.id ?? 'none'}`, fetchUsage, []);
  const rule = quotaRule(plan, 'image');
  const used = Math.max(0, usage.data.find((r) => r.metric === 'image')?.used ?? 0);
  const unlimited = isUnlimited(rule);
  return {
    limit: rule.limit,
    used,
    remaining: unlimited ? Number.POSITIVE_INFINITY : remainingOf(rule, used),
    unlimited,
    atCap: !unlimited && (rule.limit === 0 || used >= rule.limit),
    loaded: usage.loaded,
  };
}
