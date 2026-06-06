import { Bot, ClipboardCheck, Link, Mic, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal, StaggerCard, StaggerGroup } from './anim';

const SOON: Array<{ icon: LucideIcon; title: string; desc: string }> = [
  { icon: Sparkles, title: 'Geração de cards por IA', desc: 'Descreva um tema ou cole um PDF e o Kioku monta o deck.' },
  { icon: Mic, title: 'Gravação e transcrição de aula', desc: 'Grave a aula e gere cards do que realmente importa.' },
  { icon: ClipboardCheck, title: 'Simulador de provas adaptativo', desc: 'Provas que se ajustam ao seu nível conforme você avança.' },
  { icon: Link, title: 'Importar de YouTube e links', desc: 'Transforme vídeos e páginas da web em decks.' },
  { icon: Bot, title: 'Tutor de IA em cada card', desc: 'Peça explicações e exemplos na hora, sem sair do estudo.' },
];

/** Clearly labeled pill so no visitor mistakes these for current features. */
function SoonBadge() {
  return (
    <span
      className="inline-flex items-center"
      style={{
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'var(--body)',
        borderRadius: 'var(--r-full)',
        background: 'var(--accent-soft)',
        color: 'var(--accent)',
        border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
        whiteSpace: 'nowrap',
      }}
    >
      Em breve
    </span>
  );
}

export function ComingSoon() {
  return (
    <section id="em-breve" className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28" style={{ scrollMarginTop: 76 }}>
      <Reveal>
        <h2 className="display" style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 600 }}>
          Em breve no Kioku
        </h2>
        <p className="text-muted mt-3" style={{ lineHeight: 1.6 }}>O que estamos construindo a seguir.</p>
      </Reveal>

      <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-10">
        {SOON.map(({ icon: Icon, title, desc }) => (
          <StaggerCard
            key={title}
            className="p-5 md:p-6"
            style={{
              borderRadius: 'var(--r-lg)',
              background: 'var(--surface)',
              // Dashed, lower-contrast frame so coming-soon reads as "not yet".
              border: '1px dashed var(--line-strong)',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <span
                className="inline-flex items-center justify-center rounded-[var(--r-sm)]"
                style={{ width: 40, height: 40, background: 'var(--surface-2)', color: 'var(--muted)' }}
              >
                <Icon size={19} />
              </span>
              <SoonBadge />
            </div>
            {/* Content dimmed vs. the live Recursos cards. */}
            <div style={{ opacity: 0.66 }}>
              <h3 className="display" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25 }}>{title}</h3>
              <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.55 }}>{desc}</p>
            </div>
          </StaggerCard>
        ))}
      </StaggerGroup>
    </section>
  );
}
