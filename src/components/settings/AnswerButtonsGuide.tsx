import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Gauge } from 'lucide-react';
import { useReducedMotion } from '../../lib/useReducedMotion';

/**
 * Settings panel that explains what each of the four review answer buttons means.
 * Self-contained: renders its own dark panel (matching the other Settings
 * sections), a row of the four colored buttons, and four explanation rows.
 * Hovering a button highlights its row and dims the others; clicking locks it
 * (so it also works by tap on mobile, where there is no hover).
 */

type Grade = 'errei' | 'dificil' | 'bom' | 'facil';

interface GradeInfo {
  key: Grade;
  num: string;
  name: string;
  interval: string;
  bg: string;
  nameColor: string;
  subColor: string;
  tag: string;
  /** Description; phrases inside [brackets] are rendered brighter (brackets dropped). */
  desc: string;
}

const GRADES: GradeInfo[] = [
  {
    key: 'errei',
    num: '1',
    name: 'Errei',
    interval: '1 min',
    bg: '#f4402f',
    nameColor: '#fff',
    subColor: '#ffd9d3',
    tag: '· volta pro início',
    desc: 'Não lembrou de verdade. Mesmo que tenha acertado 90% do card, se escapou [qualquer pedaço], é Errei. Sem culpa: é assim que o card volta pra ser fixado.',
  },
  {
    key: 'dificil',
    num: '2',
    name: 'Difícil',
    interval: '10 min',
    bg: '#f5a623',
    nameColor: '#3d2900',
    subColor: '#5b3d00',
    tag: '· acertou no sufoco',
    desc: 'Você acertou, [mas custou]. Demorou pra lembrar, hesitou, quase escorregou. Acertou raspando.',
  },
  {
    key: 'bom',
    num: '3',
    name: 'Bom',
    interval: '1 d',
    bg: '#16a668',
    nameColor: '#fff',
    subColor: '#c5f1dd',
    tag: '· o seu padrão',
    desc: 'Acertou num [tempo natural], sem drama nem esforço extra. É o botão que você mais vai usar.',
  },
  {
    key: 'facil',
    num: '4',
    name: 'Fácil',
    interval: '4 d',
    bg: '#3478f6',
    nameColor: '#fff',
    subColor: '#cfe0ff',
    tag: '· use com parcimônia',
    desc: 'Ridiculamente óbvio. Respondeu na hora, sem pensar, tipo [a data do seu aniversário]. Só aqui. O Kioku vai espaçar muito esse card, então guarde o Fácil pro que é trivial mesmo.',
  },
];

/** Render a description, brightening the [bracketed] phrases (brackets removed). */
function renderDesc(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\])/g).map((part, i) => {
    const m = /^\[([^\]]+)\]$/.exec(part);
    if (m) {
      return (
        <span key={i} style={{ color: '#e8e8e8' }}>
          {m[1]}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function AnswerButtonsGuide() {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<Grade | null>(null);
  const [locked, setLocked] = useState<Grade | null>(null);

  // A lock takes precedence over hover; while locked, hovering others is ignored.
  const active: Grade | null = locked ?? hovered;

  const spring = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34 };

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-muted">
          <Gauge size={16} />
        </span>
        <h2 className="mono text-sm text-muted">Como avaliar cada card</h2>
      </div>
      <p className="text-sm text-muted mb-4" style={{ lineHeight: 1.55 }}>
        A nota não é sobre acertar ou errar. É sobre quanto esforço a resposta te custou.
      </p>

      {/* Row of the four real review buttons. */}
      <div className="grid grid-cols-4" style={{ gap: 10 }}>
        {GRADES.map((g) => {
          const isLocked = locked === g.key;
          return (
            <motion.button
              key={g.key}
              type="button"
              aria-pressed={isLocked}
              aria-label={`${g.name} (${g.interval})`}
              onMouseEnter={() => setHovered(g.key)}
              onMouseLeave={() => setHovered((h) => (h === g.key ? null : h))}
              onClick={() => setLocked((l) => (l === g.key ? null : g.key))}
              animate={{ y: isLocked ? -2 : 0 }}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={spring}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: '14px 8px',
                borderRadius: 12,
                background: g.bg,
                border: 'none',
                cursor: 'pointer',
                boxShadow: isLocked ? '0 0 0 2px rgba(255,255,255,0.65)' : 'none',
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: g.subColor, lineHeight: 1 }}>
                {g.num}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: g.nameColor, lineHeight: 1.2 }}>
                {g.name}
              </span>
              <span className="mono" style={{ fontSize: 11, color: g.subColor, lineHeight: 1 }}>
                {g.interval}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Explanation rows — one per grade. */}
      <div className="flex flex-col mt-4" style={{ gap: 10 }}>
        {GRADES.map((g) => {
          const isActive = active === g.key;
          const dimmed = active !== null && !isActive;
          return (
            <motion.div
              key={g.key}
              animate={{
                backgroundColor: isActive ? '#1c1c1c' : '#141414',
                opacity: dimmed ? 0.4 : 1,
                x: isActive ? 2 : 0,
              }}
              transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{
                borderLeft: `3px solid ${g.bg}`,
                borderRadius: 0,
                padding: '11px 14px',
              }}
            >
              <p style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, color: g.bg }}>{g.name}</span>
                <span className="text-muted" style={{ fontWeight: 400 }}>
                  {' '}
                  {g.tag}
                </span>
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#bdbdbd' }}>
                {renderDesc(g.desc)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
