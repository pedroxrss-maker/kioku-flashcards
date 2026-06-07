import { Reveal, StaggerCard, StaggerGroup } from './anim';

function NumberBadge({ n }: { n: string }) {
  return (
    <span
      className="display"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '2px solid var(--accent)',
        color: 'var(--accent)',
        fontSize: 20,
        fontWeight: 600,
      }}
    >
      {n}
    </span>
  );
}

// bg matches each illustration's background so the image blends into the card.
const ITEMS: Array<{ n: string; title: string; desc: string; img: string; bg: string }> = [
  { n: '1', title: 'Estudo Ativo', desc: 'Testar a memória fixa mais do que reler.', img: '/card1.png', bg: '#131316' },
  { n: '2', title: 'Repetição espaçada', desc: 'Revisar no momento certo vence a curva do esquecimento.', img: '/card2.png', bg: '#121215' },
  { n: '3', title: 'Consistência acima de intensidade', desc: 'Pouco todo dia supera maratonas.', img: '/card3.png', bg: '#121215' },
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
        {ITEMS.map((s) => (
          <StaggerCard key={s.n} className="surface p-6 md:p-7 flex flex-col" style={{ borderRadius: 'var(--r-lg)', background: s.bg }}>
            <NumberBadge n={s.n} />
            <h3 className="display mt-4" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.25 }}>{s.title}</h3>
            <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.55 }}>{s.desc}</p>
            <div className="mt-auto pt-8">
              <img src={s.img} alt="" draggable={false} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }} />
            </div>
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
