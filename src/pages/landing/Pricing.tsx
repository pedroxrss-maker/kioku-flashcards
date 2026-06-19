import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useNavigate } from 'react-router-dom';
import { Reveal } from './anim';
import { PLAN_LABELS } from '../../features/usage/limits';
import type { Plan } from '../../features/usage/limits';
import { useAuth } from '../../features/auth/AuthContext';
import { checkoutUrl, setCheckoutIntent } from '../../features/billing/checkout';
import type { BillingCycle } from '../../features/billing/checkout';
import { SIGNUPS_ENABLED } from '../../config';
import { BillingToggle, PLANS_DATA, PlanCardView } from '../../features/billing/plans';
import type { Billing } from '../../features/billing/plans';

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
  const { user } = useAuth();
  const navigate = useNavigate();

  // CTA de cada plano. O gratuito NUNCA vai para o checkout. Os planos pagos abrem
  // o checkout certo da Kiwify (com o email do usuario) quando logado; quando
  // deslogado, guardam a escolha e mandam para o cadastro/login -
  // CheckoutIntentRedirect conclui o redirect ao checkout apos autenticar. A
  // tabela de links e o nome do param vivem em features/billing/checkout.
  function handleCta(planKey: Plan) {
    if (planKey === 'free') {
      if (user) navigate('/');
      else navigate(SIGNUPS_ENABLED ? '/entrar?mode=signup' : '/entrar');
      return;
    }
    const cycle: BillingCycle = billing === 'anual' ? 'annual' : 'monthly';
    if (user?.email) {
      window.open(checkoutUrl(planKey, cycle, user.email), '_blank', 'noopener,noreferrer');
      return;
    }
    setCheckoutIntent(planKey, cycle);
    navigate(SIGNUPS_ENABLED ? '/entrar?mode=signup' : '/entrar');
  }

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // No mobile (tela estreita) os cartoes ficam menores e mais sobrepostos, para
  // os tres aparecerem juntos com o carrossel funcional. No desktop ficam
  // maiores e mais espacados (sem um cobrir o preco do outro).
  const compact = stageW > 0 && stageW < 768;
  const cardW = stageW ? Math.min(compact ? 258 : 360, stageW * (compact ? 0.56 : 0.86)) : 340;
  const spread = cardW * (compact ? 0.56 : 0.95);
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
        <div className="flex items-center justify-center mt-7">
          <BillingToggle billing={billing} onChange={setBilling} reduce={!!reduce} />
        </div>
      </Reveal>

      {/* Palco do carrossel 3D. O cartao oculto define a altura; os reais sao
          absolutos e animados em torno do centro. */}
      <Reveal>
        <div ref={stageRef} className="relative mt-8">
          {/* Espacador invisivel: as 3 cartas empilhadas na MESMA celula do grid,
              entao a altura do palco = a da carta mais alta. As cartas reais
              preenchem essa altura (inset-y-0 + h-full), ficando todas iguais. */}
          <div aria-hidden className="mx-auto grid" style={{ width: cardW, visibility: 'hidden' }}>
            {PLANS_DATA.map((p) => (
              <div key={p.key} style={{ gridArea: '1 / 1' }}>
                <PlanCardView plan={p} billing={billing} active compact={compact} onCta={handleCta} />
              </div>
            ))}
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
                className="absolute inset-y-0"
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
                <PlanCardView plan={plan} billing={billing} active={center} compact={compact} onCta={handleCta} />
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
