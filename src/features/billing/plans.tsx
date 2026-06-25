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
      { ok: true, label: '5 usos de IA por dia' },
      { ok: true, label: '20 áudios por mês' },
      { ok: false, label: 'Sem geração de imagens' },
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
      { ok: true, label: '5 decks de IA por dia' },
      { ok: true, label: '100 usos de IA por dia' },
      { ok: true, label: '500 áudios por mês' },
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
      { ok: true, label: 'Usos de IA ilimitados' },
      { ok: true, label: 'Áudios ilimitados' },
      { ok: true, label: 'Geração de 300 imagens por mês' },
      { ok: true, label: 'Funções exclusivas de IA', badge: 'Em breve' },
    ],
  },
];

/** Parse a BRL price string ("R$ 29,90") to a number (29.9). */
function parseBRL(s?: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/** Format a BRL amount without the symbol: whole numbers drop the decimals
 *  ("120"), otherwise two decimals with a comma ("120,50"). */
function formatBRLAmount(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ',');
}

/** Annual savings vs paying monthly for 12 months, from the plan's OWN prices
 *  (so it stays correct if the numbers change). 0 for the free plan. */
function annualSavings(plan: PlanCard): number {
  if (plan.free || !plan.monthly || !plan.annual) return 0;
  return (parseBRL(plan.monthly) - parseBRL(plan.annual)) * 12;
}

/** Savings-pill colors per plan, readable on EACH card's background: Basic is
 *  the dark highlighted card (light green); Advanced is the light card (deep
 *  gold). */
function savingsBadgeStyle(plan: PlanCard): CSSProperties {
  return plan.key === 'basic'
    ? { color: '#4ade80', background: 'rgba(22,163,74,0.18)', border: '1px solid rgba(22,163,74,0.35)' }
    : { color: '#8a5e0a', background: 'rgba(186,117,23,0.18)', border: '1px solid rgba(186,117,23,0.45)' };
}

/** Annual discount as a rounded percentage, from the plan's OWN prices
 *  (Básico 50%, Avançado 33% today). 0 for the free plan. */
function annualDiscountPct(plan: PlanCard): number {
  if (plan.free || !plan.monthly || !plan.annual) return 0;
  const m = parseBRL(plan.monthly);
  if (m <= 0) return 0;
  return Math.round((1 - parseBRL(plan.annual) / m) * 100);
}

/** Green "-X%" discount pill shown next to the struck price; readable on each
 *  card (Básico is the dark highlighted card, Avançado is light). */
function discountBadgeStyle(plan: PlanCard): CSSProperties {
  return plan.key === 'basic'
    ? { color: '#4ade80', background: 'rgba(22,163,74,0.20)', border: '1px solid rgba(22,163,74,0.35)' }
    : { color: '#15803d', background: 'rgba(22,163,74,0.16)', border: '1px solid rgba(22,163,74,0.4)' };
}

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
      className="billing-toggle-scale relative inline-flex p-[2px]"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-full)',
      }}
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
                style={{ background: 'rgba(255, 255, 255, 0.16)', borderRadius: 'var(--r-full)', zIndex: -1 }}
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

/** Render a feature label: when `numberStyle` is given (paid plans), bold the
 *  LEADING number token so magnitudes pop ("5 decks…", "100 usos…"); the billing
 *  period words ("dia"/"mês") are always underlined + UPPERCASED. Free passes no
 *  numberStyle, so its numbers stay flat/gray with the rest of the (dim) label. */
function renderFeatureLabel(cell: Cell, numberStyle?: CSSProperties): ReactNode {
  // Free plan (no numberStyle): plain label — no number/keyword emphasis.
  if (!numberStyle) return cell.label;
  // Paid: bold the FIRST number anywhere (so "Geração de 100 imagens" still pops);
  // keywords around it get their own emphasis (see emphasizeKeywords).
  const m = cell.label.match(/^([\s\S]*?)(\d[\d.,]*)([\s\S]*)$/);
  if (m) {
    return (
      <>
        {emphasizeKeywords(m[1], numberStyle)}
        <strong style={numberStyle}>{m[2]}</strong>
        {emphasizeKeywords(m[3], numberStyle)}
      </>
    );
  }
  return emphasizeKeywords(cell.label, numberStyle);
}

/** In a text run, every emphasis keyword gets a strong BOLD (boldStyle): "dia"/
 *  "mês" stay lowercase; "ilimitado(s)/ilimitada(s)" is also UPPERCASED. */
function emphasizeKeywords(text: string, boldStyle: CSSProperties): ReactNode {
  const re = /\bdia\b|\bmês\b|ilimitad\w*/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const w = m[0];
    out.push(
      <strong key={k++} style={boldStyle}>
        {/^ilimitad/i.test(w) ? w.toUpperCase() : w}
      </strong>,
    );
    last = m.index + w.length;
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
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
  const savings = annualSavings(plan);
  const discountPct = annualDiscountPct(plan);

  // Cores: cartoes claros (off-white) + o destacado com gradiente de accent. O
  // card destacado usa as variaveis de tema para o texto (em vez de branco fixo),
  // entao no tema CLARO (fundo rosa claro) o texto fica escuro e legivel, e no
  // escuro continua claro sobre o fundo escuro.
  const c = hi
    ? {
        title: 'var(--fg)',
        muted: 'var(--muted)',
        body: 'var(--fg)',
        faded: 'color-mix(in srgb, var(--fg) 42%, transparent)',
      }
    : { title: '#17171b', muted: '#5b5b63', body: '#17171b', faded: '#a8a7a2' };

  // Feature styling so the value gap reads at a glance: paid plans get COLORED
  // checks (Básico green, Avançado gold) + bold numbers; Free is washed-out gray.
  // Negatives use a red-ish "x" everywhere.
  const okCheckColor = plan.free ? '#555' : plan.key === 'basic' ? '#4ade80' : '#b8860b';
  const okTextColor = plan.free ? '#8a8a8a' : c.body;
  const numberStyle: CSSProperties | undefined = plan.free ? undefined : { color: c.title, fontWeight: 800 };

  const cardStyle: CSSProperties = {
    borderRadius: 'var(--r-lg)',
    boxShadow: active ? 'var(--shadow-pop)' : 'var(--shadow-card)',
    transition: 'box-shadow .3s ease',
    position: 'relative', // anchors the absolute "Economize" savings badge

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
        {/* Struck monthly price directly above the big annual price (annual only).
            Its height slides 0 <-> auto as billing toggles, so the card box (and,
            on the landing, the carousel stage driven by the hidden spacer) expands
            and contracts smoothly instead of jumping. */}
        <AnimatePresence initial={false}>
          {!plan.free && isAnnual && (
            <motion.div
              key="struck"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex items-center gap-2" style={{ paddingBottom: compact ? 3 : 5 }}>
                <span
                  className={compact ? 'text-[11px]' : 'text-sm'}
                  style={{ color: c.muted, textDecoration: 'line-through', lineHeight: 1 }}
                >
                  {plan.monthly}
                </span>
                {discountPct > 0 && (
                  <span
                    className="mono"
                    style={{
                      fontSize: compact ? 9 : 10.5,
                      fontWeight: 700,
                      lineHeight: 1.4,
                      padding: '1px 6px',
                      borderRadius: 'var(--r-full)',
                      ...discountBadgeStyle(plan),
                    }}
                  >
                    -{discountPct}%
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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

      {/* "Economize ... no anual" — só no Básico e só no MENSAL. Fica NO FLUXO
          (abaixo do preço) para nunca colidir com o selo "Mais popular" em cards
          estreitos no mobile. Entra/sai com fade + slide de altura. */}
      <AnimatePresence initial={false}>
        {plan.key === 'basic' && !isAnnual && savings > 0 && (
          <motion.div
            key="save-annual"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <span
              className="mono"
              style={{
                display: 'inline-block',
                marginTop: compact ? 8 : 12,
                fontSize: compact ? 10 : 11,
                fontWeight: 700,
                lineHeight: 1.4,
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                whiteSpace: 'nowrap',
                ...savingsBadgeStyle(plan),
              }}
            >
              Economize R${formatBRLAmount(savings)} no anual
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparativo de recursos: tudo aparece, com check (incluso) ou X (ausente). */}
      <ul
        className={`flex flex-col flex-1 ${compact ? 'mt-3 gap-1.5' : 'mt-5 gap-2.5'}`}
        style={{ borderTop: `1px solid ${hi ? 'var(--line)' : '#e6e5e0'}`, paddingTop: compact ? 11 : 18 }}
      >
        {plan.features.map((cell) => (
          <li key={cell.label} className="flex items-center gap-2">
            {cell.ok ? (
              <Check size={compact ? 13 : 16} style={{ color: okCheckColor, flexShrink: 0 }} />
            ) : (
              <X size={compact ? 13 : 16} style={{ color: '#6b3a3a', flexShrink: 0 }} />
            )}
            <span className={featText} style={{ color: cell.ok ? okTextColor : c.faded, lineHeight: 1.3 }}>
              {renderFeatureLabel(cell, numberStyle)}
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
