/**
 * Public marketing landing for Kioku. Rendered at "/" for logged-out visitors
 * (see App routing). Self-contained under src/pages/landing/. Keeps the app's
 * identity: dark study-dashboard look, accent #ff3b1f, Fraunces titles, Manrope
 * body. All copy in Brazilian Portuguese, no em-dashes. Animations respect
 * prefers-reduced-motion via framer-motion's useReducedMotion.
 */
import { useNavigate } from 'react-router-dom';
import { SIGNUPS_ENABLED } from '../../config';
import { Reveal } from './anim';
import { NeuroLockup } from './brand';
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
          className="text-center p-10 md:p-16"
          style={{
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--line)',
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 13%, var(--surface)), var(--surface))',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <h2 className="display mx-auto" style={{ fontSize: 'clamp(34px, 5.4vw, 58px)', fontWeight: 600, maxWidth: 760, lineHeight: 1.08 }}>
            Comece a vencer o esquecimento hoje<span style={{ color: 'var(--accent)' }}>.</span>
          </h2>
          <div className="mt-7 flex justify-center">
            <button type="button" className="btn-mega" onClick={() => nav(SIGNUPS_ENABLED ? '/entrar?mode=signup' : '/entrar')}>
              Criar conta grátis
            </button>
          </div>
          <p className="text-muted mt-4">É grátis e seu progresso fica salvo na sua conta.</p>
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
