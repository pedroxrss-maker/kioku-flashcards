/**
 * Upgrade prompt shown when a FREE user hits an AI usage limit (a QuotaError).
 * Instead of a dead-end error, it presents both paid plans (Básico + Avançado)
 * with the monthly/annual toggle — reusing the SAME plan cards/data as the
 * landing (features/billing/plans) — and a working Kiwify checkout (checkoutUrl).
 */
import { useState } from 'react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Modal } from '../../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { checkoutUrl } from './checkout';
import type { BillingCycle, PaidPlan } from './checkout';
import { BillingToggle, PLANS_DATA, PlanCardView } from './plans';
import type { Billing } from './plans';
import type { Plan } from '../usage/limits';

/** A short line explaining which limit was hit (adapts to the AI metric). */
function contextLine(metric: string | null): string {
  switch (metric) {
    case 'deckGen':
    case 'deck':
      return 'Você atingiu o limite de geração de decks com IA.';
    case 'tutor':
      return 'Você atingiu o limite do tutor IA.';
    case 'image':
      return 'Geração de imagens é um recurso dos planos pagos.';
    case 'upgrade':
      return 'Tenha mais gerações com IA, áudios e recursos exclusivos.';
    default:
      return 'Você atingiu um limite do plano gratuito.';
  }
}

export function UpgradeModal({
  open,
  metric,
  onClose,
}: {
  open: boolean;
  metric: string | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const { user, plan } = useAuth();
  const [billing, setBilling] = useState<Billing>('anual');

  // Paid plans open the correct Kiwify checkout WITH the user's email (so the
  // webhook matches the purchase). Reuses checkoutUrl — no second link table.
  function buy(planKey: Plan) {
    if (planKey === 'free') return; // only paid plans are shown here
    const cycle: BillingCycle = billing === 'anual' ? 'annual' : 'monthly';
    const url = checkoutUrl(planKey as PaidPlan, cycle, user?.email);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Modal open={open} onClose={onClose} width={920}>
      <div className="text-center">
        <h2 className="display" style={{ fontSize: 24 }}>
          Desbloqueie a IA do Kioku
        </h2>
        <p className="text-muted mt-2" style={{ lineHeight: 1.5 }}>
          {contextLine(metric)} Compare os planos e escolha o seu.
        </p>
      </div>

      <div className="flex items-center justify-center mt-5">
        <BillingToggle billing={billing} onChange={setBilling} reduce={!!reduce} />
      </div>

      {/* All three plans (Gratuito + Básico + Avançado) for comparison. The free
          card and the user's CURRENT plan show no checkout button; only higher
          tiers they can actually move to keep their "Assinar …" button. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        {PLANS_DATA.map((p) => (
          <PlanCardView
            key={p.key}
            plan={p}
            billing={billing}
            active
            compact={false}
            onCta={buy}
            currentPlan={plan}
            hideCta={!!p.free || p.key === plan}
          />
        ))}
      </div>
    </Modal>
  );
}
