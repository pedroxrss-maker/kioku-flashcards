import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import {
  BarChart3,
  Bot,
  Brain,
  Download,
  FileDown,
  Layers,
  Link,
  Monitor,
  RefreshCw,
  Smartphone,
  Sparkles,
  Volume2,
  Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Reveal, StaggerCard, StaggerGroup } from './anim';
import brandLogo from '../../../neurofluency-logo-branca.png';
import plantaImg from '../../../planta-kioku.png';

/** Each card reveals an interactive mini "screen" on hover (`on`); animations
 *  fall back to their final/static state under reduced motion (`reduce`). */
interface DemoProps {
  on: boolean;
  reduce: boolean;
}
type DemoComp = (p: DemoProps) => ReactNode;

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
  Demo: DemoComp;
}

/* ----------------------------------------------------------- demo pieces --- */
function WaveBars({ on, reduce, color = 'var(--accent)' }: DemoProps & { color?: string }) {
  const bars = [7, 13, 9, 16, 11, 15, 8, 13, 10, 15, 9, 12];
  return (
    <div className="flex items-center gap-[3px]" style={{ height: 18 }}>
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="block"
          style={{ width: 3, borderRadius: 2, background: color }}
          initial={{ height: h }}
          animate={on && !reduce ? { height: [h, 5, h] } : { height: h }}
          transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.05, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- 9 demos ----- */
function DemoAI({ on, reduce }: DemoProps) {
  return (
    <div className="flex flex-col gap-2 h-full justify-center">
      <span className="text-[10px] mono" style={{ color: 'var(--muted)' }}>
        tema do deck
      </span>
      <div className="rounded px-2 py-1 text-[11px]" style={{ background: 'var(--surface-2)', color: 'var(--fg)' }}>
        Fotossíntese
        <motion.span
          animate={on && !reduce ? { opacity: [1, 0, 1] } : { opacity: 1 }}
          transition={{ repeat: Infinity, duration: 0.9 }}
        >
          |
        </motion.span>
      </div>
      {/* card gerado: aparece e depois flipa (frente -> verso), em loop */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.4, type: 'spring', stiffness: 260, damping: 22 }}
        style={{ perspective: 700 }}
      >
        <motion.div
          className="relative"
          style={{ transformStyle: 'preserve-3d', height: 84 }}
          animate={on && !reduce ? { rotateY: [0, 0, 180, 180, 0] } : { rotateY: 0 }}
          transition={
            on && !reduce
              ? { repeat: Infinity, duration: 3.6, times: [0, 0.3, 0.5, 0.8, 1], delay: 0.8 }
              : { duration: 0 }
          }
        >
          {/* frente */}
          <div
            className="rounded p-2 absolute inset-0"
            style={{
              background: '#ffffff',
              border: '1px solid #e6e5e0',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            <span className="text-[9px] mono" style={{ color: 'var(--accent)' }}>
              frente
            </span>
            <p className="text-[11px] mt-0.5" style={{ color: '#17171b' }}>
              O que é fotossíntese?
            </p>
          </div>
          {/* verso: resposta a esquerda + imagem no espaco que sobra a direita */}
          <div
            className="rounded p-2 absolute inset-0 flex flex-col overflow-hidden"
            style={{
              background: '#ffffff',
              border: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <span className="text-[9px] mono" style={{ color: 'var(--accent-green)' }}>
              verso
            </span>
            <div className="flex items-center gap-2 mt-0.5 flex-1 min-h-0">
              <p className="text-[11px]" style={{ color: '#17171b', flex: 1 }}>
                A planta transforma luz em energia.
              </p>
              <img
                src={plantaImg}
                alt=""
                draggable={false}
                style={{ height: 38, width: 'auto', borderRadius: 4, objectFit: 'contain', flexShrink: 0 }}
              />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function DemoImport({ reduce }: DemoProps) {
  return (
    <div className="flex flex-col gap-2 h-full justify-center">
      <div className="flex items-center gap-1.5 rounded px-2 py-1 min-w-0" style={{ background: 'var(--surface-2)' }}>
        <Globe size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span className="text-[10px] mono truncate" style={{ color: 'var(--muted)' }}>
          youtube.com/watch?v=…
        </span>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="flex-1 rounded"
            style={{ height: 28, background: 'var(--surface)', border: '1px solid var(--line-strong)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.25 + i * 0.13 }}
          />
        ))}
      </div>
      <span className="text-[10px] mono text-center" style={{ color: 'var(--accent-green)' }}>
        3 cards prontos
      </span>
    </div>
  );
}

function DemoTutor({ on, reduce }: DemoProps) {
  return (
    <div className="flex flex-col gap-1.5 h-full justify-center">
      <div
        className="self-end rounded px-2 py-1 text-[10px]"
        style={{ background: 'var(--surface-2)', color: 'var(--fg)', maxWidth: '82%' }}
      >
        Não entendi :(
      </div>
      <motion.div
        className="self-start rounded px-2 py-1 text-[10px]"
        style={{ background: 'var(--accent-soft)', color: 'var(--fg)', maxWidth: '88%' }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.35 }}
      >
        Pensa numa planta: ela usa a luz como "comida" para virar energia.
        <motion.span
          animate={on && !reduce ? { opacity: [0.2, 1, 0.2] } : { opacity: 1 }}
          transition={{ repeat: Infinity, duration: 1 }}
        >
          {' '}
          ▍
        </motion.span>
      </motion.div>
    </div>
  );
}

function DemoMedia({ on, reduce }: DemoProps) {
  return (
    <div className="flex flex-col gap-2 h-full justify-center">
      <p className="text-[11px]" style={{ color: 'var(--fg)' }}>
        to thrive = <b>prosperar</b>
      </p>
      <motion.div
        className="rounded"
        style={{ height: 36, background: 'linear-gradient(135deg, var(--accent), var(--accent-blue))' }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: reduce ? 0 : 0.2 }}
      />
      <WaveBars on={on} reduce={reduce} color="var(--accent-green)" />
    </div>
  );
}

function DemoAlgo({ on, reduce }: DemoProps) {
  return (
    <div className="flex items-center justify-center gap-6 h-full">
      {/* SM-2: cerebro classico */}
      <div className="flex flex-col items-center gap-2">
        <motion.div
          animate={on && !reduce ? { opacity: [1, 0.5, 1], scale: [1, 0.95, 1] } : { opacity: 1 }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          style={{ color: 'var(--accent-blue)' }}
        >
          <Brain size={46} strokeWidth={1.5} />
        </motion.div>
        <span
          className="text-[10px] mono px-2 py-0.5 rounded-full"
          style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
        >
          SM-2
        </span>
      </div>
      {/* FSRS: o cerebro da logo do Kioku, em laranja (mascara a logo branca) */}
      <div className="flex flex-col items-center gap-2">
        <motion.div
          aria-hidden
          animate={on && !reduce ? { opacity: [0.5, 1, 0.5], scale: [0.95, 1, 0.95] } : { opacity: 1 }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          style={{
            width: 46,
            height: 46,
            background: '#ff8c00',
            WebkitMaskImage: `url(${brandLogo})`,
            maskImage: `url(${brandLogo})`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
          }}
        />
        <span
          className="text-[10px] mono px-2 py-0.5 rounded-full"
          style={{ background: 'color-mix(in srgb, #ff8c00 16%, transparent)', color: '#ff8c00' }}
        >
          FSRS
        </span>
      </div>
    </div>
  );
}

function DemoAudio({ on, reduce }: DemoProps) {
  // Waveform grande, preenchendo o bloco (alturas em % da area do demo).
  const bars = Array.from({ length: 24 }, (_, i) => 22 + Math.round(58 * Math.abs(Math.sin(i * 0.6))));
  return (
    <div className="flex items-center justify-center gap-[3px] h-full w-full">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="block"
          style={{ flex: 1, borderRadius: 3, background: 'var(--accent)' }}
          initial={{ height: `${h}%` }}
          animate={
            on && !reduce
              ? { height: [`${h}%`, `${Math.max(12, Math.round(h * 0.35))}%`, `${h}%`] }
              : { height: `${h}%` }
          }
          transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.04, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function DemoStats({ reduce }: DemoProps) {
  const bars = [10, 16, 8, 20, 14, 22, 12];
  return (
    <div className="flex flex-col gap-2.5 h-full justify-center">
      <div className="flex items-end gap-1" style={{ height: 24 }}>
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-sm"
            style={{ background: 'var(--accent)' }}
            initial={{ height: 2 }}
            animate={{ height: h }}
            transition={{ delay: reduce ? 0 : i * 0.06, type: 'spring', stiffness: 200, damping: 18 }}
          />
        ))}
      </div>
      <div className="grid grid-cols-10 gap-[3px]">
        {Array.from({ length: 30 }).map((_, i) => {
          const lvl = (i * 7) % 4;
          return (
            <motion.span
              key={i}
              style={{
                aspectRatio: '1',
                borderRadius: 2,
                background: lvl
                  ? `color-mix(in srgb, var(--accent-green) ${lvl * 28}%, var(--surface-2))`
                  : 'var(--surface-2)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : i * 0.015 }}
            />
          );
        })}
      </div>
    </div>
  );
}

function DemoAnki({ reduce }: DemoProps) {
  return (
    <div className="flex flex-col gap-2.5 h-full justify-center">
      <div className="flex items-center gap-1.5 text-[10px] mono" style={{ color: 'var(--muted)' }}>
        <FileDown size={12} style={{ color: 'var(--accent)' }} /> baralho.apkg
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'var(--surface-2)' }}>
        <motion.div
          style={{ height: '100%', background: 'var(--accent)' }}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: reduce ? 0 : 1.1, ease: 'easeInOut' }}
        />
      </div>
      <span className="text-[10px] mono" style={{ color: 'var(--accent-green)' }}>
        240 cards importados
      </span>
    </div>
  );
}

function DemoSync({ on, reduce }: DemoProps) {
  return (
    <div className="flex items-center justify-center gap-4 h-full w-full">
      <Monitor size={66} strokeWidth={1.4} style={{ color: 'var(--fg)' }} />
      <motion.div
        animate={on && !reduce ? { rotate: 360 } : { rotate: 0 }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
        style={{ color: 'var(--accent)' }}
      >
        <RefreshCw size={30} strokeWidth={2} />
      </motion.div>
      <Smartphone size={52} strokeWidth={1.4} style={{ color: 'var(--fg)' }} />
    </div>
  );
}

const FEATURES: Feature[] = [
  { icon: Sparkles, title: 'Geração de cards por IA', desc: 'Descreva um tema, cole anotações ou um PDF e a IA monta o deck pronto.', Demo: DemoAI },
  { icon: Link, title: 'Importar do YouTube', desc: 'Transforme vídeos do YouTube em decks de estudo.', Demo: DemoImport },
  { icon: Bot, title: 'Tutor de IA em cada card', desc: 'Peça exemplos, analogias e explicações na hora, sem sair da revisão.', Demo: DemoTutor },
  { icon: Layers, title: 'Crie cards com texto, imagem e áudio', desc: 'Texto formatado, imagens e áudio direto no card.', Demo: DemoMedia },
  { icon: Brain, title: 'Dois algoritmos: SM-2 e FSRS', desc: 'Escolha por deck qual algoritmo de repetição usar.', Demo: DemoAlgo },
  { icon: Volume2, title: 'Áudio em qualquer idioma', desc: 'Voz do navegador ou áudio gerado na nuvem, em qualquer língua.', Demo: DemoAudio },
  { icon: BarChart3, title: 'Estatísticas e heatmap', desc: 'Acompanhe revisões, acertos, mapa de calor e sequências.', Demo: DemoStats },
  { icon: Download, title: 'Importe do Anki (.apkg)', desc: 'Traga seus baralhos do Anki em poucos cliques.', Demo: DemoAnki },
  { icon: RefreshCw, title: 'Sincroniza entre dispositivos', desc: 'Sua conta guarda tudo e sincroniza entre aparelhos.', Demo: DemoSync },
];

/* ---------------------------------------------------------- the card ------- */
/** Janela tipo "tela do app" que sobe de dentro do bloco para demonstrar. */
function DemoScreen({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <div className="flex items-center gap-1.5 px-3 shrink-0" style={{ height: 26, borderBottom: '1px solid var(--line)' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
          <span key={dot} style={{ width: 7, height: 7, borderRadius: 999, background: dot, opacity: 0.85 }} />
        ))}
      </div>
      <div className="flex-1 p-3 min-h-0">{children}</div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc, Demo }: Feature) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  // Ao passar o mouse, a capa off-white sobe (de baixo para cima) e revela a
  // tela escondida atrás, que demonstra o recurso. A demo só roda enquanto o
  // bloco está visível (ou em hover). Sem dobra de página.
  const visible = useInView(ref, { amount: 0.05 });
  const demoOn = hover || (visible && !reduce);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden h-full min-h-[170px] sm:min-h-[210px]"
      style={{ borderRadius: 'var(--r-lg)' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* a tela escondida (atrás da capa), com a animação do recurso */}
      <DemoScreen>
        <Demo on={demoOn} reduce={!!reduce} />
      </DemoScreen>

      {/* a capa off-white por cima: sobe de baixo para cima revelando a tela */}
      <motion.div
        className="absolute inset-0 p-4 md:p-6"
        style={{ background: '#e8e6e1', border: '1px solid #d6d4ce', borderRadius: 'var(--r-lg)', color: '#17171b' }}
        initial={false}
        animate={reduce ? { opacity: hover ? 0 : 1 } : { y: hover ? '-100%' : '0%' }}
        transition={{ duration: reduce ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <span
          className="icon-tile mb-4"
          style={{ width: 42, height: 42, background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Icon size={20} />
        </span>
        <h3 className="display" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: '#17171b' }}>
          {title}
        </h3>
        <p className="text-sm mt-2" style={{ lineHeight: 1.55, color: '#5b5b63' }}>
          {desc}
        </p>
      </motion.div>
    </div>
  );
}

export function Features() {
  return (
    <section id="recursos" className="mx-auto max-w-[1180px] px-5 md:px-8 py-20 md:py-28" style={{ scrollMarginTop: 76 }}>
      <Reveal>
        <div className="max-w-2xl">
          <h2 className="display" style={{ fontSize: 'clamp(31px, 4.8vw, 48px)', fontWeight: 600 }}>
            Recursos
          </h2>
          <p className="text-muted mt-3" style={{ lineHeight: 1.6 }}>
            Tudo que você precisa para transformar estudo em memória de longo prazo. Passe o mouse para
            ver cada recurso em ação.
          </p>
        </div>
      </Reveal>

      <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-7 md:gap-x-11 gap-y-5 md:gap-y-6 mt-10">
        {FEATURES.map((f) => (
          <StaggerCard key={f.title} className="h-full">
            <FeatureCard {...f} />
          </StaggerCard>
        ))}
      </StaggerGroup>
    </section>
  );
}
