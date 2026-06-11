import { BarChart3, Brain, Download, Layers, RefreshCw, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal, StaggerCard, StaggerGroup } from './anim';

const FEATURES: Array<{ icon: LucideIcon; title: string; desc: string }> = [
  { icon: Layers, title: 'Crie cards com texto, imagem e áudio', desc: 'Texto formatado, imagens e áudio direto no card.' },
  { icon: Brain, title: 'Dois algoritmos: SM-2 e FSRS', desc: 'Escolha por deck qual algoritmo de repetição usar.' },
  { icon: Volume2, title: 'Áudio em qualquer idioma', desc: 'Voz do navegador ou áudio gerado na nuvem, em qualquer língua.' },
  { icon: BarChart3, title: 'Estatísticas e heatmap', desc: 'Acompanhe revisões, acertos, mapa de calor e sequências.' },
  { icon: Download, title: 'Importe do Anki (.apkg)', desc: 'Traga seus baralhos do Anki em poucos cliques.' },
  { icon: RefreshCw, title: 'Sincroniza entre dispositivos', desc: 'Sua conta guarda tudo e sincroniza entre aparelhos.' },
];

export function Features() {
  return (
    <section id="recursos" className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28" style={{ scrollMarginTop: 76 }}>
      <Reveal>
        <div className="max-w-2xl">
          <h2 className="display" style={{ fontSize: 'clamp(31px, 4.8vw, 48px)', fontWeight: 600 }}>Recursos</h2>
          <p className="text-muted mt-3" style={{ lineHeight: 1.6 }}>
            Tudo que você precisa para transformar estudo em memória de longo prazo. Disponível agora.
          </p>
        </div>
      </Reveal>

      <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-10">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <StaggerCard key={title} className="h-full">
            {/* off-white card on the dark section; tech-border traces on hover */}
            <div
              className="hover-lift tech-border p-5 md:p-6 h-full"
              style={{ borderRadius: 'var(--r-lg)', position: 'relative', background: '#f5f4f1', border: '1px solid #e6e5e0', color: '#17171b' }}
            >
              <span className="icon-tile mb-4" style={{ width: 42, height: 42, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <Icon size={20} />
              </span>
              <h3 className="display" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: '#17171b' }}>{title}</h3>
              <p className="text-sm mt-2" style={{ lineHeight: 1.55, color: '#5b5b63' }}>{desc}</p>
            </div>
          </StaggerCard>
        ))}
      </StaggerGroup>
    </section>
  );
}
