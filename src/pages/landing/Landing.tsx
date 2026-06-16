/**
 * Public marketing landing for Kioku. Rendered at "/" for logged-out visitors
 * (see App routing). Self-contained under src/pages/landing/. Keeps the app's
 * identity: dark study-dashboard look, accent #ff3b1f, Fraunces titles, Manrope
 * body. All copy in Brazilian Portuguese, no em-dashes. Animations respect
 * prefers-reduced-motion via framer-motion's useReducedMotion.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Lock, Rocket, ShieldCheck, Trophy, User } from 'lucide-react';
import { SIGNUPS_ENABLED } from '../../config';
import { Reveal } from './anim';
import { NeuroLockup } from './brand';
import ctaLogo from '../../../kioku logo.png';
import { LandingNav } from './LandingNav';
import { Hero } from './Hero';
import { ForgettingCurve } from './ForgettingCurve';
import { Features } from './Features';
import { HowItWorks } from './HowItWorks';
import { Science } from './Science';
import { Pricing } from './Pricing';
import { ComingSoon } from './ComingSoon';
import { LandingFooter } from './LandingFooter';

function NeuroBand() {
  return (
    <section className="mx-auto max-w-[1180px] px-5 md:px-8 py-6">
      <Reveal>
        <div
          className="p-7 md:p-10 text-center"
          style={{
            borderRadius: 'var(--r-lg)',
            border: '1px solid #e6e5e0',
            background: '#f5f4f1',
            color: '#17171b',
          }}
        >
          <div className="mb-3 flex justify-center">
            <NeuroLockup size={18} onLight />
          </div>
          <p className="display" style={{ fontSize: 'clamp(24px, 3.6vw, 36px)', fontWeight: 600, lineHeight: 1.2, color: '#17171b' }}>
            O Kioku é o app de flashcards do{' '}
            <span style={{ fontFamily: 'var(--body)', fontWeight: 800 }}>
              neuro<span style={{ color: 'var(--accent)' }}>fluency</span>
            </span>
            .
          </p>
          <p className="mt-3" style={{ maxWidth: 640, marginInline: 'auto', lineHeight: 1.6, color: '#5b5b63' }}>
            A mesma neurociência aplicada ao aprendizado: recordação ativa, repetição espaçada e
            consistência acima de intensidade.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function FinalCta() {
  const nav = useNavigate();
  return (
    <section className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28">
      <Reveal>
        <div
          className="flex flex-col items-center text-center overflow-hidden px-5 md:px-8 pt-9 md:pt-11 pb-8 md:pb-10"
          style={{
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--line)',
            background: '#000',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Logo do Kioku, mantida. */}
          <img src={ctaLogo} alt="Kioku" draggable={false} style={{ height: 173, width: 'auto', maxWidth: '64vw', display: 'block', marginBottom: 16 }} />

          {/* Selo */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 mb-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-full)' }}
          >
            <Trophy size={13} style={{ color: 'var(--accent)' }} />
            <span className="text-[13px]" style={{ color: 'var(--fg)' }}>O primeiro passo é seu.</span>
          </div>

          {/* Título */}
          <h2
            className="display"
            style={{ fontSize: 'clamp(27px, 4.3vw, 48px)', fontWeight: 600, lineHeight: 1.08, maxWidth: 656 }}
          >
            Comece a vencer o esquecimento <span style={{ color: 'var(--accent)' }}>hoje.</span>
          </h2>

          {/* Subtítulo */}
          <p
            className="mt-4"
            style={{ color: 'var(--muted)', fontSize: 'clamp(13px, 1.3vw, 15px)', lineHeight: 1.55, maxWidth: 460 }}
          >
            Crie sua conta gratuita e transforme conhecimento em{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>progresso real</span>, todos os
            dias.
          </p>

          {/* Botão */}
          <button
            type="button"
            className="btn-mega mt-6"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', fontSize: 14 }}
            onClick={() => nav(SIGNUPS_ENABLED ? '/entrar?mode=signup' : '/entrar')}
          >
            <User size={16} /> Criar conta grátis <ArrowRight size={16} />
          </button>

          {/* Linha de confiança */}
          <p className="mt-3 inline-flex items-center gap-2" style={{ color: 'var(--muted)', fontSize: 12.5 }}>
            <ShieldCheck size={13} style={{ color: 'var(--accent)' }} /> É grátis e seu progresso fica salvo na sua conta.
          </p>

          {/* Três destaques */}
          <div
            className="grid sm:grid-cols-3 gap-5 mt-8 w-full"
            style={{ borderTop: '1px solid var(--line)', paddingTop: 22 }}
          >
            {[
              { Icon: Rocket, title: '100% gratuito', desc: 'Acesso completo, sem custos e para sempre.' },
              { Icon: BarChart3, title: 'Acompanhe seu progresso', desc: 'Veja sua evolução e mantenha a consistência.' },
              { Icon: Lock, title: 'Seus dados protegidos', desc: 'Segurança e privacidade em primeiro lugar.' },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2.5 text-left">
                <span
                  className="shrink-0 flex items-center justify-center rounded-full"
                  style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <Icon size={15} />
                </span>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--fg)', fontSize: 13.5 }}>{title}</p>
                  <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Landing() {
  return (
    <div className="landing-root" style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh', overflowX: 'clip' }}>
      <LandingNav />
      <main>
        <Hero />
        <NeuroBand />
        <ForgettingCurve />
        <HowItWorks />
        <Features />
        <Science />
        <Pricing />
        <ComingSoon />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
