import { FloatCard, Reveal, StaggerCard, StaggerGroup } from './anim';

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
        <h2 className="display" style={{ fontSize: 'clamp(31px, 4.8vw, 48px)', fontWeight: 600 }}>Como funciona</h2>
        <p className="text-muted mt-3" style={{ lineHeight: 1.6 }}>Três passos. Poucos minutos por dia.</p>
      </Reveal>

      <StaggerGroup className="grid md:grid-cols-3 gap-5 md:gap-6 mt-10">
        {STEPS.map((s, i) => (
          <StaggerCard key={s.n} className="h-full">
            <FloatCard className="h-full" dur={5 + i * 0.7} delay={i * 0.5}>
              <div className="surface p-5 md:p-8 flex flex-col h-full" style={{ borderRadius: 'var(--r-lg)', background: s.bg }}>
                <span className="display" style={{ fontSize: 'clamp(34px, 9vw, 46px)', fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>
                  {s.n}
                </span>
                <h3 className="display mt-3" style={{ fontSize: 20, fontWeight: 600 }}>{s.title}</h3>
                <p className="text-muted mt-2" style={{ fontSize: 15, lineHeight: 1.6 }}>{s.desc}</p>
                <div className="mt-auto pt-5 md:pt-8">
                  <img src={s.img} alt="" draggable={false} className="block w-full h-auto max-h-[190px] md:max-h-none object-contain mx-auto" style={{ borderRadius: 12 }} />
                </div>
              </div>
            </FloatCard>
          </StaggerCard>
        ))}
      </StaggerGroup>
    </section>
  );
}
