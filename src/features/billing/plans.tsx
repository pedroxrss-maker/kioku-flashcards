/**
 * Shared plan data + card UI for the pricing surfaces. The landing carousel
 * (pages/landing/Pricing) and the in-app UpgradeModal both render these, so the
 * prices/limits/labels exist in exactly ONE place — no second hardcoded copy.
 */
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { PLAN_LABELS } from '../usage/limits';
import type { Plan } from '../usage/limits';

export type Billing = 'mensal' | 'anual';

/** Uma linha do comparativo: incluida (ok) ou nao, com rotulo e badge opcional. */
export interface Cell {
  ok: boolean;
  label: string;
  /** Optional substring of `label` to underline for emphasis (e.g. "dia"). */
  emphasis?: string;
  badge?: string;
}

export interface PlanCard {
  key: Plan;
  tagline: string;
  /** Gratuito: preco fixo "R$ 0", o toggle nao se aplica. */
  free?: boolean;
  monthly?: string;
  annual?: string;
  cta: string;
  highlighted?: boolean;
  badge?: string;
  /** Mesma ordem de linhas em todos os planos, para comparar lado a lado. */
  features: Cell[];
}

export const PLANS_DATA: PlanCard[] = [
  {
    key: 'free',
    tagline: 'Para experimentar o método',
    free: true,
    cta: 'Começar grátis',
    features: [
      { ok: true, label: '2 decks de IA por mês' },
      { ok: true, label: '15 usos das ferramentas de IA por dia' },
      { ok: true, label: '50 áudios por mês para seus cards' },
      { ok: false, label: 'Sem imagens nos cards' },
      { ok: false, label: 'Funções exclusivas de IA' },
    ],
  },
  {
    key: 'basic',
    tagline: 'Para estudar sem limites no dia a dia',
    monthly: 'R$ 19,90',
    annual: 'R$ 9,90',
    cta: 'Assinar Básico',
    highlighted: true,
    badge: 'Mais popular',
    features: [
      { ok: true, label: '5 decks de IA por dia', emphasis: 'dia' },
      { ok: true, label: '100 usos das ferramentas de IA por dia' },
      { ok: true, label: '500 áudios por mês para seus cards' },
      { ok: true, label: 'Geração de 100 imagens por mês' },
      { ok: false, label: 'Funções exclusivas de IA' },
    ],
  },
  {
    key: 'advanced',
    tagline: 'Para quem não aceita esquecer nada',
    monthly: 'R$ 29,90',
    annual: 'R$ 19,90',
    cta: 'Assinar Avançado',
    features: [
      { ok: true, label: 'Decks de IA ilimitados' },
      { ok: true, label: 'Ferramentas de IA ilimitadas' },
      { ok: true, label: 'Áudios ilimitados' },
      { ok: true, label: '300 imagens de IA por mês para seus cards' },
      { ok: true, label: 'Recursos exclusivos que chegam primeiro pra você', badge: 'Em breve' },
    ],
  },
];

/** Toggle compacto mensal/anual com indicador deslizante (layout animation). */
export function BillingToggle({
  billing,
  onChange,
  reduce,
}: {
  billing: Billing;
  onChange: (b: Billing) => void;
  reduce: boolean;
}) {
  return (
    <div
      className="relative inline-flex p-[2px]"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-full)' }}
    >
      {(['mensal', 'anual'] as Billing[]).map((b) => {
        const a = billing === b;
        return (
          <button
            key={b}
            type="button"
            onClick={() => onChange(b)}
            aria-pressed={a}
            className="relative px-2 py-[2px] text-[8px] leading-none transition-colors"
            style={{ borderRadius: 'var(--r-full)', fontWeight: a ? 600 : 500, color: a ? '#fff' : 'var(--muted)' }}
          >
            {a && (
              <motion.span
                layoutId="billing-knob"
                className="absolute inset-0"
                style={{ background: 'var(--accent)', borderRadius: 'var(--r-full)', zIndex: -1 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {b === 'mensal' ? 'Mensal' : 'Anual'}
          </button>
        );
      })}
    </div>
  );
}

/** A feature label, optionally underlining one emphasized word (e.g. "dia"). */
function renderFeatureLabel(cell: Cell): ReactNode {
  if (!cell.emphasis) return cell.label;
  const i = cell.label.indexOf(cell.emphasis);
  if (i < 0) return cell.label;
  return (
    <>
      {cell.label.slice(0, i)}
      <u style={{ textUnderlineOffset: 2 }}>{cell.emphasis}</u>
      {cell.label.slice(i + cell.emphasis.length)}
    </>
  );
}

export function PlanCardView({
  plan,
  billing,
  active,
  compact,
  onCta,
}: {
  plan: PlanCard;
  billing: Billing;
  active: boolean;
  /** No mobile o conteudo encolhe (padding/preco/textos) para caber sem quebrar. */
  compact: boolean;
  /** Acao do botao do plano (assinar / começar grátis). */
  onCta: (plan: Plan) => void;
}) {
  const reduce = useReducedMotion();
  const hi = !!plan.highlighted;
  const isAnnual = billing === 'anual';

  // Cores: cartoes claros (off-white) + o destacado com gradiente de accent escuro.
  const c = hi
    ? { title: 'var(--fg)', muted: 'rgba(245, 245, 244, 0.72)', body: 'var(--fg)', faded: 'rgba(245, 245, 244, 0.4)' }
    : { title: '#17171b', muted: '#5b5b63', body: '#17171b', faded: '#a8a7a2' };

  const cardStyle: CSSProperties = {
    borderRadius: 'var(--r-lg)',
    boxShadow: active ? 'var(--shadow-pop)' : 'var(--shadow-card)',
    transition: 'box-shadow .3s ease',
    ...(hi
      ? {
          border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--surface)), var(--surface))',
        }
      : { border: '1px solid #e6e5e0', background: '#f5f4f1' }),
  };

  const price = plan.free ? 'R$ 0' : isAnnual ? plan.annual! : plan.monthly!;
  const sub = plan.free ? 'Grátis para sempre' : '';
  const featText = compact ? 'text-[11px]' : 'text-sm';
  const priceStyle: CSSProperties = {
    fontSize: compact ? 23 : 40,
    fontWeight: 600,
    lineHeight: 1,
    color: c.title,
    whiteSpace: 'nowrap',
  };

  return (
    <div className={`${compact ? 'p-3.5' : 'p-6 md:p-7'} h-full flex flex-col`} style={cardStyle}>
      <div className="flex items-center gap-1.5">
        <h3 className="display" style={{ fontSize: compact ? 15 : 20, fontWeight: 600, color: c.title }}>
          {PLAN_LABELS[plan.key]}
        </h3>
        {plan.badge && (
          <span
            className={`mono px-2 py-0.5 ${compact ? 'text-[8px]' : 'text-[11px]'}`}
            style={{ background: 'var(--accent)', color: '#fff', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap' }}
          >
            {plan.badge}
          </span>
        )}
      </div>
      <p className={`${compact ? 'mt-1 text-[10.5px]' : 'mt-1.5 text-sm'}`} style={{ color: c.muted, lineHeight: 1.4 }}>
        {plan.tagline}
      </p>

      {/* Preco: ao alternar mensal/anual, o numero troca com um crossfade suave.
          Um "sizer" invisivel (o maior preco) reserva a largura, entao o "/mês"
          ao lado nao se desloca durante o fade. */}
      <div className={compact ? 'mt-2.5' : 'mt-5'}>
        <div className="flex items-baseline gap-1.5">
          {plan.free ? (
            <span className="display" style={priceStyle}>
              {price}
            </span>
          ) : (
            <span style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap' }}>
              <span aria-hidden className="display" style={{ ...priceStyle, visibility: 'hidden' }}>
                {plan.monthly}
              </span>
              <AnimatePresence initial={false}>
                <motion.span
                  key={price}
                  className="display"
                  style={{ ...priceStyle, position: 'absolute', left: 0, top: 0 }}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.28, ease: 'easeInOut' }}
                >
                  {price}
                </motion.span>
              </AnimatePresence>
            </span>
          )}
          {!plan.free && (
            <span className={compact ? 'text-[10px]' : 'text-sm'} style={{ color: c.muted }}>
              /mês
            </span>
          )}
        </div>
        <p
          className={compact ? 'text-[10px] mt-1' : 'text-[12px] mt-1.5'}
          style={{ color: c.muted, minHeight: compact ? 12 : 16 }}
        >
          {sub}
        </p>
      </div>

      {/* Comparativo de recursos: tudo aparece, com check (incluso) ou X (ausente). */}
      <ul
        className={`flex flex-col flex-1 ${compact ? 'mt-3 gap-1.5' : 'mt-5 gap-2.5'}`}
        style={{ borderTop: `1px solid ${hi ? 'var(--line)' : '#e6e5e0'}`, paddingTop: compact ? 11 : 18 }}
      >
        {plan.features.map((cell) => (
          <li key={cell.label} className="flex items-center gap-2">
            {cell.ok ? (
              <Check size={compact ? 13 : 16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            ) : (
              <X size={compact ? 13 : 16} style={{ color: c.faded, flexShrink: 0 }} />
            )}
            <span className={featText} style={{ color: cell.ok ? c.body : c.faded, lineHeight: 1.3 }}>
              {renderFeatureLabel(cell)}
            </span>
            {cell.badge && (
              <span
                className={`mono px-1.5 py-0.5 ml-auto ${compact ? 'text-[9px]' : 'text-[10px]'}`}
                style={{
                  background: hi ? 'rgba(255, 255, 255, 0.14)' : 'var(--accent-soft)',
                  color: hi ? '#fff' : 'var(--accent)',
                  borderRadius: 'var(--r-full)',
                  whiteSpace: 'nowrap',
                }}
              >
                {cell.badge}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Assinar / Começar grátis: vai para o checkout da Kiwify (planos pagos) ou
          para o cadastro/login (gratuito), via onCta. */}
      <button
        type="button"
        onClick={() => onCta(plan.key)}
        className={`${hi ? 'btn btn-accent' : 'btn'} ${compact ? 'btn-sm ' : ''}w-full ${compact ? 'mt-3' : 'mt-6'}`}
        style={hi ? undefined : { background: '#17171b', color: '#fff', borderColor: 'transparent' }}
      >
        {plan.cta}
      </button>
    </div>
  );
}
