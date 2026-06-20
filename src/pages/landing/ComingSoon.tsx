import { ClipboardCheck, FileAudio } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal, StaggerCard, StaggerGroup } from './anim';

const SOON: Array<{ icon: LucideIcon; title: string; desc: string }> = [
  { icon: FileAudio, title: 'Transcreva áudios em flashcards', desc: 'Anexe um arquivo de áudio, revise a transcrição em um editor e gere os cards do texto corrigido.' },
  { icon: ClipboardCheck, title: 'Simulador de provas adaptativo', desc: 'Provas que se ajustam ao seu nível conforme você avança.' },
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
    <section id="em-breve" className="mx-auto max-w-[1180px] px-5 md:px-8 pt-6 md:pt-8 pb-20 md:pb-28" style={{ scrollMarginTop: 76 }}>
      <Reveal>
        <h2 className="display" style={{ fontSize: 'clamp(31px, 4.8vw, 48px)', fontWeight: 600 }}>
          Em breve no Kioku
        </h2>
        <p className="text-muted mt-3" style={{ lineHeight: 1.6 }}>O que estamos construindo a seguir.</p>
      </Reveal>

      <StaggerGroup className="grid sm:grid-cols-2 gap-4 md:gap-5 mt-10 max-w-3xl">
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
