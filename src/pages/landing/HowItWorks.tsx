import { Reveal, StaggerCard, StaggerGroup } from './anim';

// bg matches each illustration's background so the image blends into the card.
const STEPS: Array<{ n: string; title: string; desc: string; img: string; bg: string }> = [
  {
    n: '1',
    title: 'Crie ou importe seu deck',
    desc: 'Escreva seus cards ou traga os seus do Anki.',
    img: '/flashcard1.png',
    bg: '#141417',
  },
  {
    n: '2',
    title: 'Estude poucos minutos por dia',
    desc: 'Vire o card, avalie, siga; o algoritmo decide o que volta e quando.',
    img: '/flashcard2.png',
    bg: '#141417',
  },
  {
    n: '3',
    title: 'Veja a retenção subir',
    desc: 'O que você já sabe volta menos; o que é difícil volta antes.',
    img: '/flashcard3.png',
    bg: '#141417',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28" style={{ scrollMarginTop: 76 }}>
      <Reveal>
        <h2 className="display" style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 600 }}>Como funciona</h2>
        <p className="text-muted mt-3" style={{ lineHeight: 1.6 }}>Três passos. Poucos minutos por dia.</p>
      </Reveal>

      <StaggerGroup className="grid md:grid-cols-3 gap-5 md:gap-6 mt-10">
        {STEPS.map((s) => (
          <StaggerCard key={s.n} className="surface p-7 md:p-8 flex flex-col" style={{ borderRadius: 'var(--r-lg)', background: s.bg }}>
            <span className="display" style={{ fontSize: 46, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>
              {s.n}
            </span>
            <h3 className="display mt-3" style={{ fontSize: 20, fontWeight: 600 }}>{s.title}</h3>
            <p className="text-muted mt-2" style={{ fontSize: 15, lineHeight: 1.6 }}>{s.desc}</p>
            <div className="mt-auto pt-8">
              <img src={s.img} alt="" draggable={false} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }} />
            </div>
          </StaggerCard>
        ))}
      </StaggerGroup>
    </section>
  );
}
