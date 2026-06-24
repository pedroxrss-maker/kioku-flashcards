/**
 * Header plan badge + usage popover (replaces the old, inert notification bell).
 *
 * The badge shows the user's current plan in a plan-specific color (free=neutral,
 * basic=green, advanced=premium gold). Clicking it opens a compact popover with
 * how much of the 4 metered quotas has been USED (used/cap): decks (deckGen),
 * ferramentas de IA (tutor), áudios (audio) and imagens (image).
 *
 * Plan comes from the auth context (already loaded — no extra fetch). Usage comes
 * from the `get_usage()` RPC (cached via the query store); the cap + period for
 * each metric come from PLAN_LIMITS, so we show used out of the cap per the period.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../db/store';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../../theme/theme';
import { isBlocked, isUnlimited, quotaRule } from './limits';
import type { Plan, UsageMetric } from './limits';

/** One row of the get_usage() RPC (it returns one per metric of the plan). */
interface UsageRow {
  metric: string;
  period: string;
  used: number;
  max_count: number;
  remaining: number;
}

async function fetchUsage(): Promise<UsageRow[]> {
  const { data, error } = await supabase.rpc('get_usage');
  if (error) throw error;
  return (data as UsageRow[] | null) ?? [];
}

/** Plan label for the badge (free = "Grátis", per the product copy). */
const BADGE_LABEL: Record<Plan, string> = {
  free: 'Grátis',
  basic: 'Básico',
  advanced: 'Avançado',
};

/** Distinct, on-brand palette: free neutral, basic green, advanced premium gold. */
const PLAN_STYLE: Record<Plan, { color: string; bg: string; border: string }> = {
  free: {
    color: 'var(--muted)',
    bg: 'var(--surface-2)',
    border: 'var(--line-strong)',
  },
  basic: {
    color: 'var(--accent-green)',
    bg: 'color-mix(in srgb, var(--accent-green) 14%, transparent)',
    border: 'color-mix(in srgb, var(--accent-green) 45%, transparent)',
  },
  advanced: {
    color: 'var(--accent-amber)',
    bg: 'color-mix(in srgb, var(--accent-amber) 16%, transparent)',
    border: 'color-mix(in srgb, var(--accent-amber) 50%, transparent)',
  },
};

/** The 4 quotas shown, in order, with compact labels. */
const METRICS: Array<{ metric: UsageMetric; label: string }> = [
  { metric: 'deckGen', label: 'Decks de IA' },
  { metric: 'tutor', label: 'Ferramentas de IA' },
  { metric: 'audio', label: 'Áudios' },
  { metric: 'image', label: 'Imagens' },
];

/** On the LIGHT theme the airy amber tint washes out on the cream surface, so the
 *  Avançado badge gets a richer, higher-contrast gold (deep-gold text/icon, a
 *  fuller fill and a solid amber border) so it stands out. */
const ADVANCED_LIGHT_STYLE = {
  color: '#8a5600',
  bg: 'color-mix(in srgb, var(--accent-amber) 30%, #ffffff)',
  border: 'color-mix(in srgb, var(--accent-amber) 80%, transparent)',
};

export function PlanUsageBadge() {
  const { user, plan } = useAuth();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const usage = useQuery<UsageRow[]>(`usage:${user?.id ?? 'none'}`, fetchUsage, []);

  const usedByMetric = new Map<string, number>();
  for (const r of usage.data) usedByMetric.set(r.metric, r.used);

  const style =
    plan === 'advanced' && theme === 'light' ? ADVANCED_LIGHT_STYLE : PLAN_STYLE[plan];

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next) usage.reload(); // refresh on open (AI usage is metered server-side)
      return next;
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Plano ${BADGE_LABEL[plan]} — ver uso`}
        title="Seu plano e uso"
        className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-2 py-1.5 text-xs font-semibold transition-colors"
        style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
      >
        <Sparkles size={13} />
        {BADGE_LABEL[plan]}
        <ChevronDown size={13} style={{ opacity: 0.7 }} />
      </button>

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <AnimatePresence>
        {open && (
          <motion.div
            key="usagemenu"
            className="absolute right-0 z-50 mt-1.5 w-64 p-3"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{
              transformOrigin: 'top right',
              background: 'var(--surface)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-pop)',
            }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold">Uso</span>
              <span className="text-[11px] font-bold" style={{ color: style.color }}>
                {BADGE_LABEL[plan]}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {METRICS.map(({ metric, label }) => {
                const rule = quotaRule(plan, metric);
                const used = usedByMetric.get(metric) ?? 0;
                const unlimited = isUnlimited(rule);
                const blocked = isBlocked(rule);
                const finite = !unlimited && !blocked;

                let valueText: string;
                let valueColor = 'var(--fg)';
                if (unlimited) {
                  valueText = 'Ilimitado';
                  valueColor = 'var(--accent-green)';
                } else if (blocked) {
                  valueText = 'Indisponível';
                  valueColor = 'var(--muted)';
                } else {
                  const usedText = usage.loaded
                    ? String(used)
                    : usage.error
                      ? '—'
                      : '…';
                  valueText = `${usedText}/${rule.limit}`;
                  if (usage.loaded && used >= rule.limit) valueColor = 'var(--accent)';
                }

                return (
                  <div key={metric} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted truncate">{label}</span>
                    <span className="flex items-baseline gap-1 shrink-0">
                      <span className="tabular-nums font-semibold" style={{ color: valueColor }}>
                        {valueText}
                      </span>
                      {finite && (
                        <span className="text-[10px] text-muted">
                          {rule.period === 'day' ? 'hoje' : 'mês'}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
