import { CalendarCheck, Clock, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal, StaggerCard, StaggerGroup } from './anim';

const ITEMS: Array<{ icon: LucideIcon; title: string; desc: string }> = [
  { icon: Target, title: 'Recordação ativa', desc: 'Testar a memória fixa mais do que reler.' },
  { icon: Clock, title: 'Repetição espaçada', desc: 'Revisar no momento certo vence a curva do esquecimento.' },
  { icon: CalendarCheck, title: 'Consistência acima de intensidade', desc: 'Pouco todo dia supera maratonas.' },
];

export function Science() {
  return (
    <section id="ciencia" className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28" style={{ scrollMarginTop: 76 }}>
      <Reveal>
        <h2 className="display" style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 600 }}>
          Ciência, não autoajuda
        </h2>
      </Reveal>

      <StaggerGroup className="grid md:grid-cols-3 gap-4 md:gap-5 mt-9">
        {ITEMS.map(({ icon: Icon, title, desc }) => (
          <StaggerCard key={title} className="surface p-5 md:p-6" style={{ borderRadius: 'var(--r-lg)' }}>
            <span className="inline-flex items-center justify-center rounded-[var(--r-sm)]" style={{ width: 38, height: 38, background: 'var(--surface-2)', color: 'var(--accent)' }}>
              <Icon size={18} />
            </span>
            <h3 className="display mt-4" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.25 }}>{title}</h3>
            <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.55 }}>{desc}</p>
          </StaggerCard>
        ))}
      </StaggerGroup>

      <Reveal delay={0.1}>
        <p className="text-muted mt-8" style={{ fontSize: 15, maxWidth: 620, lineHeight: 1.6 }}>
          Sem promessas mágicas. Só os métodos que a ciência cognitiva sustenta.
        </p>
      </Reveal>
    </section>
  );
}
