import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Reveal } from './anim';
import { PLAN_LABELS } from '../../features/usage/limits';
import type { Plan } from '../../features/usage/limits';

type Billing = 'mensal' | 'anual';

/** Uma linha do comparativo: incluida (ok) ou nao, com rotulo e badge opcional. */
interface Cell {
  ok: boolean;
  label: string;
  badge?: string;
}

interface PlanCard {
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

const PLANS_DATA: PlanCard[] = [
  {
    key: 'free',
    tagline: 'Para experimentar o método',
    free: true,
    cta: 'Começar grátis',
    features: [
      { ok: true, label: '6 decks com IA por dia' },
      { ok: true, label: '20 explicações do tutor por dia' },
      { ok: true, label: '500 áudios por mês para seus cards' },
      { ok: false, label: 'Sem imagens nos cards' },
      { ok: false, label: 'Funções exclusivas de IA' },
    ],
  },
  {
    key: 'basic',
    tagline: 'Para estudar sem limites no dia a dia',
    monthly: 'R$ 14,90',
    annual: 'R$ 9,90',
    cta: 'Assinar Básico',
    highlighted: true,
    badge: 'Mais popular',
    features: [
      { ok: true, label: 'Crie decks com IA o dia inteiro' },
      { ok: true, label: 'Tutor sempre que travar numa matéria' },
      { ok: true, label: 'Áudios ilimitados para seus cards' },
      { ok: true, label: 'Geração de 100 imagens' },
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
      { ok: true, label: 'IA sem freio para maratonar estudos' },
      { ok: true, label: 'Tutor ilimitado em qualquer matéria' },
      { ok: true, label: 'Áudio em todos os cards' },
      { ok: true, label: 'Imagens ilimitadas nos seus cards', badge: 'Ilimitadas' },
      { ok: true, label: 'Recursos exclusivos que chegam primeiro pra você', badge: 'Em breve' },
    ],
  },
];

/**
 * Planos: carrossel 3D (coverflow). Clicar num bloco lateral o traz para o
 * centro; os demais se reposicionam em profundidade. Sem setas de navegacao. O
 * toggle mensal/anual fica FORA dos blocos, pequeno e discreto, predefinido em
 * "anual". Botoes inertes (visual-only).
 */
export function Pricing() {
  const reduce = useReducedMotion();
  const [billing, setBilling] = useState<Billing>('anual');
  const [active, setActive] = useState(1); // Basico no centro por padrao
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardW = stageW ? Math.min(360, stageW * 0.86) : 340;
  // Espacamento largo o bastante para os blocos nao cobrirem o preco um do outro.
  const spread = cardW * 0.95;
  const n = PLANS_DATA.length;

  // Slot circular de cada cartao: -1 (esquerda), 0 (centro), 1 (direita). Em loop,
  // entao sempre ha um bloco de cada lado e nada some ao trocar de plano.
  const slotOf = (i: number, a: number) => {
    let d = (((i - a) % n) + n) % n;
    if (d > n / 2) d -= n;
    return d;
  };

  return (
    <section
      id="precos"
      className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28"
      style={{ scrollMarginTop: 76 }}
    >
      <Reveal>
        <div className="max-w-2xl">
          <h2 className="display" style={{ fontSize: 'clamp(31px, 4.8vw, 48px)', fontWeight: 600 }}>
            Planos
          </h2>
          <p className="text-muted mt-3" style={{ lineHeight: 1.6 }}>
            Estudar sempre será grátis. Os planos liberam a inteligência artificial que faz você
            aprender mais rápido e esquecer menos.
          </p>
        </div>
      </Reveal>

      {/* Toggle pequeno e discreto, fora dos blocos, com slide suave. */}
      <Reveal>
        <div className="flex items-center justify-center gap-1.5 mt-7">
          <BillingToggle billing={billing} onChange={setBilling} reduce={!!reduce} />
          <span className="text-[8px]" style={{ color: 'var(--muted)' }}>
            Economize 33%
          </span>
        </div>
      </Reveal>

      {/* Palco do carrossel 3D. O cartao oculto define a altura; os reais sao
          absolutos e animados em torno do centro. */}
      <Reveal>
        <div ref={stageRef} className="relative mt-8">
          <div aria-hidden className="mx-auto" style={{ width: cardW, visibility: 'hidden' }}>
            <PlanCardView plan={PLANS_DATA[1]} billing={billing} active />
          </div>

          {PLANS_DATA.map((plan, i) => {
            const slot = slotOf(i, active);
            const center = slot === 0;
            // Cartao central por cima (z maior); os laterais ficam atras, entao o
            // bloco que vai de uma ponta a outra DESLIZA por tras dos demais ate
            // ser reposicionado, em vez de sumir.
            const style: CSSProperties = {
              width: cardW,
              left: '50%',
              marginLeft: -cardW / 2,
              zIndex: center ? 20 : 10,
              cursor: center ? 'default' : 'pointer',
            };
            return (
              <motion.div
                key={plan.key}
                className="absolute top-0"
                style={style}
                initial={false}
                animate={{
                  x: slot * spread,
                  scale: center ? 1 : 0.86,
                  opacity: center ? 1 : 0.6,
                }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 210, damping: 26 }}
                onClick={() => !center && setActive(i)}
              >
                <PlanCardView plan={plan} billing={billing} active={center} />
              </motion.div>
            );
          })}
        </div>
      </Reveal>

      {/* Indicadores (tambem clicaveis). */}
      <div className="flex items-center justify-center gap-2 mt-5">
        {PLANS_DATA.map((p, i) => (
          <button
            key={p.key}
            type="button"
            aria-label={`Ir para o plano ${PLAN_LABELS[p.key]}`}
            onClick={() => setActive(i)}
            className="transition-all"
            style={{
              width: i === active ? 22 : 8,
              height: 8,
              borderRadius: 'var(--r-full)',
              background: i === active ? 'var(--accent)' : 'var(--line-strong)',
            }}
          />
        ))}
      </div>
    </section>
  );
}

/** Toggle compacto mensal/anual com indicador deslizante (layout animation). */
function BillingToggle({
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

function PlanCardView({
  plan,
  billing,
  active,
}: {
  plan: PlanCard;
  billing: Billing;
  active: boolean;
}) {
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

  return (
    <div className="p-6 md:p-7 h-full flex flex-col" style={cardStyle}>
      <div className="flex items-center gap-2">
        <h3 className="display" style={{ fontSize: 20, fontWeight: 600, color: c.title }}>
          {PLAN_LABELS[plan.key]}
        </h3>
        {plan.badge && (
          <span
            className="mono text-[11px] px-2 py-0.5"
            style={{ background: 'var(--accent)', color: '#fff', borderRadius: 'var(--r-full)' }}
          >
            {plan.badge}
          </span>
        )}
      </div>
      <p className="text-sm mt-1.5" style={{ color: c.muted, lineHeight: 1.5 }}>
        {plan.tagline}
      </p>

      {/* Preco */}
      <div className="mt-5">
        <div className="flex items-baseline gap-1.5">
          <span className="display" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: c.title }}>
            {price}
          </span>
          {!plan.free && (
            <span className="text-sm" style={{ color: c.muted }}>
              /mês
            </span>
          )}
        </div>
        <p className="text-[12px] mt-1.5" style={{ color: c.muted, minHeight: 16 }}>
          {sub}
        </p>
      </div>

      {/* Comparativo de recursos: tudo aparece, com check (incluso) ou X (ausente). */}
      <ul
        className="mt-5 flex flex-col gap-2.5 flex-1"
        style={{ borderTop: `1px solid ${hi ? 'var(--line)' : '#e6e5e0'}`, paddingTop: 18 }}
      >
        {plan.features.map((cell) => (
          <li key={cell.label} className="flex items-center gap-2.5">
            {cell.ok ? (
              <Check size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            ) : (
              <X size={16} style={{ color: c.faded, flexShrink: 0 }} />
            )}
            <span className="text-sm" style={{ color: cell.ok ? c.body : c.faded, lineHeight: 1.4 }}>
              {cell.label}
            </span>
            {cell.badge && (
              <span
                className="mono text-[10px] px-1.5 py-0.5 ml-auto"
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

      {/* Botao inerte (visual-only) */}
      <button
        type="button"
        onClick={() => {
          /* TODO: ligar ao checkout/assinatura. Sem acao no passo visual. */
        }}
        className={hi ? 'btn btn-accent w-full mt-6' : 'btn w-full mt-6'}
        style={hi ? undefined : { background: '#17171b', color: '#fff', borderColor: 'transparent' }}
      >
        {plan.cta}
      </button>
    </div>
  );
}
