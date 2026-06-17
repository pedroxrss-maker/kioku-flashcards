import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Brain, FlaskConical, RefreshCw } from 'lucide-react';
import { Reveal, scrollToId } from './anim';
import { NeuroWordmark } from './brand';
import { HeroMockup } from './HeroMockup';
import { SIGNUPS_ENABLED } from '../../config';

const VALUES = [
  { icon: Brain, title: 'SM-2 e FSRS', line: 'dois algoritmos de repetição espaçada' },
  { icon: RefreshCw, title: 'Sincroniza', line: 'seu progresso em qualquer dispositivo' },
  { icon: FlaskConical, title: 'Base científica', line: 'curva de Ebbinghaus aplicada' },
];

export function Hero() {
  const nav = useNavigate();
  const reduce = useReducedMotion();

  return (
    <section id="topo" className="relative">
      <div className="mx-auto max-w-[1180px] px-5 md:px-8 pt-12 md:pt-16 pb-16 hero-grid">
        {/* HEAD: pill + title (mobile: above the mockup) */}
        <div className="hero-head">
          <Reveal>
            <span className="pill pill-muted" style={{ padding: '6px 12px', fontSize: 12, gap: 7 }}>
              Powered by <NeuroWordmark size={12} />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="display hero-title mt-5">
              {/* Linha 1: "A CURA", com CURA dentro de uma elipse desenhada à mão. */}
              <span style={{ display: 'block' }}>
                A{' '}
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  CURA
                  <svg
                    viewBox="0 0 100 64"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '-12%',
                      top: '-30%',
                      width: '124%',
                      height: '158%',
                      fill: 'none',
                      stroke: 'var(--accent)',
                      strokeWidth: 'clamp(3px, 0.5vw, 5px)',
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round',
                      overflow: 'visible',
                      pointerEvents: 'none',
                    }}
                  >
                    <path
                      vectorEffect="non-scaling-stroke"
                      d="M26 14 C6 22 4 50 30 58 C58 67 92 60 95 34 C97 16 78 7 46 9 C28 10 16 16 20 30"
                    />
                  </svg>
                </span>
              </span>

              {/* Linha 2 */}
              <span style={{ display: 'block' }}>PARA O</span>

              {/* Linha 3: "ESQUECIMENTO." com pincelada laranja embaixo e o ponto em accent. */}
              <span style={{ display: 'block' }}>
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  ESQUECIMENTO
                  <svg
                    viewBox="0 0 300 20"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: 0,
                      bottom: '-0.14em',
                      width: '100%',
                      height: '0.32em',
                      fill: 'none',
                      stroke: 'var(--accent)',
                      strokeWidth: 'clamp(5px, 0.85vw, 9px)',
                      strokeLinecap: 'round',
                      overflow: 'visible',
                      pointerEvents: 'none',
                    }}
                  >
                    <path
                      vectorEffect="non-scaling-stroke"
                      d="M8 12 C80 5 170 6 230 9 C262 10 286 11 296 6"
                    />
                  </svg>
                </span>
                <span style={{ color: 'var(--accent)' }}>.</span>
              </span>
            </h1>
          </Reveal>
        </div>

        {/* MOCKUP: on mobile it sits right after the title; on desktop, right column */}
        <div className="hero-mockup">
          <Reveal delay={0.1} y={30}>
            <HeroMockup />
          </Reveal>
        </div>

        {/* BODY: subhead + CTAs + value props */}
        <div className="hero-body">
          <Reveal delay={0.12}>
            <div className="text-muted mt-5" style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', maxWidth: 540, lineHeight: 1.6 }}>
              <p>
                O Kioku usa memorização ativa e repetição espaçada para colocar cada card na sua
                frente{' '}
                <strong style={{ color: 'var(--fg)', fontWeight: 700 }}>
                  no momento exato que você ia esquecer
                </strong>
                .
              </p>
              <p className="mt-4">Aqui, o estudo vira memória de longo prazo.</p>
            </div>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="flex flex-wrap items-center gap-3 mt-7">
              <button type="button" className="btn-mega" onClick={() => nav(SIGNUPS_ENABLED ? '/entrar?mode=signup' : '/entrar')}>
                Criar conta grátis
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => scrollToId('como-funciona', reduce)}>
                Ver como funciona
              </button>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="grid sm:grid-cols-3 gap-4 mt-9">
              {VALUES.map(({ icon: Icon, title, line }) => (
                <div key={title} className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center justify-center rounded-[var(--r-sm)]" style={{ width: 34, height: 34, background: 'var(--surface-2)', color: 'var(--accent)' }}>
                    <Icon size={17} />
                  </span>
                  <p className="text-sm" style={{ fontWeight: 700 }}>{title}</p>
                  <p className="text-xs text-muted" style={{ lineHeight: 1.5 }}>{line}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
