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
import { useUpgradeModal } from '../billing/UpgradeModalProvider';
import { Modal } from '../../components/Modal';
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

/** Próxima data em que a cota reseta: 'day' à meia-noite UTC do dia seguinte;
 *  'month' no 1º dia do mês seguinte (UTC) — alinhado ao current_bucket do SQL. */
function quotaResetDate(period: string): Date {
  const now = new Date();
  return period === 'month'
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
function fmtResetDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

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
  const { openPlans } = useUpgradeModal();
  const [open, setOpen] = useState(false);
  // Avançado is the top tier (nothing to upgrade to): its bottom button shows a
  // notice about managing/cancelling via the Kiwify confirmation e-mail instead.
  const [manageOpen, setManageOpen] = useState(false);
  const isTopTier = plan === 'advanced';
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
      {/* Gradiente "IA" (rosa→magenta→violeta) usado para pintar o ícone de
          Sparkles do badge em TODOS os planos. */}
      <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="kioku-ai-spark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff8ec7" />
            <stop offset="50%" stopColor="#ff3d77" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Plano ${BADGE_LABEL[plan]} — ver uso`}
        title="Seu plano e uso"
        className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-2 py-1.5 text-xs font-semibold transition-colors"
        style={
          plan === 'free'
            ? {
                color: '#fff',
                background: 'linear-gradient(135deg, #4a2a87 0%, #271650 100%)',
                border: '1px solid color-mix(in srgb, #8b5cf6 50%, transparent)',
              }
            : { color: style.color, background: style.bg, border: `1px solid ${style.border}` }
        }
      >
        <Sparkles size={13} color="url(#kioku-ai-spark)" />
        {BADGE_LABEL[plan]}
        <ChevronDown size={13} style={{ opacity: 0.7 }} />
      </button>

      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      <AnimatePresence>
        {open && (
          <motion.div
            key="usagemenu"
            // Mobile: the badge sits mid-header, so anchoring right-0 pushes the
            // popover off the left edge. Center it on the viewport instead — fixed,
            // just under the sticky header, centered via inset-x-0 + mx-auto + a
            // fixed width (no transform, so it survives framer's scale/translate).
            // sm+: revert to the badge-anchored dropdown.
            className="fixed inset-x-0 mx-auto top-16 z-50 w-64 p-3 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mx-0 sm:mt-1.5"
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

                // Cota atingida (free/básico, limite finito): mostra quando renova.
                const limitHit = finite && usage.loaded && used >= rule.limit;
                return (
                  <div key={metric} className="flex flex-col gap-0.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
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
                    {limitHit && (
                      <span className="text-[10px] self-end" style={{ color: 'var(--muted)' }}>
                        Renova em {fmtResetDate(quotaResetDate(rule.period))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Always-visible bottom action. Free/Básico → open the plans modal
                (reuses the QuotaError upgrade flow). Avançado (top tier) → show the
                Kiwify e-mail management notice. */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (isTopTier) setManageOpen(true);
                else openPlans();
              }}
              className="btn btn-accent btn-sm w-full mt-3"
            >
              {isTopTier ? 'Gerenciar plano' : 'Fazer upgrade do plano'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avançado: how to manage/cancel (Kiwify has no stable customer-portal URL). */}
      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="Gerenciar plano" width={460}>
        <p className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
          Para alterar ou cancelar sua assinatura, use o botão de gerenciamento no e-mail de
          confirmação de pagamento enviado pela Kiwify (assunto:{' '}
          <b className="text-fg">“Pagamento de assinatura aprovado”</b>). O cancelamento interrompe
          as próximas cobranças.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-accent btn-sm" onClick={() => setManageOpen(false)}>
            Entendi
          </button>
        </div>
      </Modal>
    </div>
  );
}
