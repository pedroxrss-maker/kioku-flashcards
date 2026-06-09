import { useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Brain, Check, Database, Eye, Palette, SlidersHorizontal, User } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { Toggle } from '../components/Toggle';
import { SmoothSlider } from '../components/SmoothSlider';
import { TtsSettings } from '../features/tts/TtsSettings';
import { useSettings } from '../db/hooks';
import { repo } from '../db/repositories';
import { seedForUserIfEmpty } from '../db/seedSupabase';
import { UNLIMITED_PER_DAY } from '../db/types';
import type { Algorithm } from '../db/types';

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-muted">{icon}</span>
        <h2 className="mono text-sm text-muted">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Settings() {
  const settings = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const reduce = useReducedMotion();

  if (!settings) {
    return (
      <div className="rise max-w-3xl mx-auto">
        <PageHeader title="Configurações" />
        <p className="mono text-muted text-sm">Carregando…</p>
      </div>
    );
  }

  async function resetAll() {
    await repo.resetAll();
    await seedForUserIfEmpty();
    window.location.href = '/';
  }

  const reviewsUnlimited = settings.reviewsPerDay >= UNLIMITED_PER_DAY;

  return (
    <div className="rise flex flex-col gap-6 max-w-3xl mx-auto">
      <PageHeader title="Configurações" subtitle="Padrões globais do Kioku." />

      {/* Profile */}
      <Section icon={<User size={16} />} title="Perfil">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label" htmlFor="s-name">Nome de exibição</label>
            <input
              id="s-name"
              className="field"
              placeholder="Estudante"
              value={settings.displayName}
              onChange={(e) => repo.saveSettings({ displayName: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="s-goal">Meta diária de cards</label>
            <input
              id="s-goal"
              type="number"
              min={1}
              className="field"
              value={settings.dailyGoal}
              onChange={(e) => repo.saveSettings({ dailyGoal: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
        </div>
      </Section>

      {/* Study defaults */}
      <Section icon={<SlidersHorizontal size={16} />} title="Estudo (padrões para novos decks)">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label" htmlFor="s-new">Cards novos por dia</label>
            <input
              id="s-new"
              type="number"
              min={0}
              className="field"
              value={settings.newPerDay}
              onChange={(e) => repo.saveSettings({ newPerDay: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="s-rev">Revisões por dia</label>
            <div style={{ position: 'relative', minHeight: 46 }}>
              <AnimatePresence mode="wait" initial={false}>
                {reviewsUnlimited ? (
                  <motion.div
                    key="inf"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
                    className="field flex items-center"
                    style={{ color: 'var(--accent)', fontWeight: 600 }}
                  >
                    Infinitas
                  </motion.div>
                ) : (
                  <motion.input
                    key="num"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
                    id="s-rev"
                    type="number"
                    min={0}
                    className="field"
                    value={settings.reviewsPerDay}
                    onChange={(e) => repo.saveSettings({ reviewsPerDay: Math.max(0, Number(e.target.value) || 0) })}
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Toggle
                checked={reviewsUnlimited}
                onChange={(v) => repo.saveSettings({ reviewsPerDay: v ? UNLIMITED_PER_DAY : 200 })}
              />
              <span className="text-xs">Infinitas</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted mt-3">
          Decks existentes mantêm seus próprios limites (ajuste em cada deck).
        </p>
        <p className="text-xs text-muted mt-2" style={{ lineHeight: 1.55 }}>
          Com <b className="text-fg">Infinitas</b>, o Kioku entrega todas as revisões que o algoritmo
          (SM-2 ou FSRS) marcar como devidas no dia, sem teto — ideal para zerar o acúmulo de cards.
          Em compensação, dias com muitas cartas vencidas podem render sessões longas.
        </p>
      </Section>

      {/* Default algorithm */}
      <Section icon={<Brain size={16} />} title="Algoritmo padrão">
        <p className="text-xs text-muted mb-3">
          Aplicado a cada novo deck. Cada deck pode trocar de algoritmo depois, nas configurações dele.
        </p>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Algoritmo padrão">
          {(['fsrs', 'sm2'] as Algorithm[]).map((a) => {
            const selected = settings.defaultAlgorithm === a;
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => repo.saveSettings({ defaultAlgorithm: a })}
                className="algo-option relative rounded-[var(--r-sm)] px-4 py-3 text-left cursor-pointer"
              >
                {selected && (
                  <motion.span
                    layoutId="algo-highlight"
                    className="absolute inset-0 rounded-[var(--r-sm)]"
                    style={{ boxShadow: 'inset 0 0 0 2px var(--accent)', background: 'var(--accent-soft)', pointerEvents: 'none' }}
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative z-[1] flex items-center justify-between gap-2 mb-0.5">
                  <span className="mono text-sm" style={{ color: selected ? 'var(--accent)' : 'var(--fg)' }}>
                    {a === 'fsrs' ? 'FSRS' : 'SM-2'}
                  </span>
                  {selected && <Check size={15} style={{ color: 'var(--accent)' }} />}
                </span>
                <span className="relative z-[1] block text-xs text-muted">
                  {a === 'fsrs' ? 'Moderno · padrão' : 'Clássico (Anki)'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detailed explanation — only for the selected algorithm */}
        {settings.defaultAlgorithm === 'fsrs' ? (
          <p className="text-sm text-muted mt-4" style={{ lineHeight: 1.65 }}>
            O <b className="text-fg">FSRS</b> (Free Spaced Repetition Scheduler) é o agendador moderno
            do Kioku. Ele modela a sua memória com três variáveis — <b className="text-fg">estabilidade</b>{' '}
            (quanto tempo a lembrança dura), <b className="text-fg">dificuldade</b> (o quão custoso é o
            card) e a probabilidade de você recordar agora — e aprende com todo o seu histórico de
            revisões. Com isso, prevê o momento em que você estaria prestes a esquecer e agenda a
            revisão exatamente ali: menos repetições para o que você já domina e mais foco no que é
            difícil. Você define a meta de retenção abaixo e ele calcula os intervalos para alcançá-la
            com o mínimo de revisões.
          </p>
        ) : (
          <p className="text-sm text-muted mt-4" style={{ lineHeight: 1.65 }}>
            O <b className="text-fg">SM-2</b> é o algoritmo clássico do SuperMemo, o mesmo que
            popularizou o Anki. A cada revisão você avalia o card (errei, difícil, bom, fácil) e ele
            ajusta um <b className="text-fg">fator de facilidade</b> que multiplica o intervalo:
            acertos afastam o card no tempo, erros o trazem de volta aos passos de aprendizado. É
            simples, previsível e testado por décadas — ideal se você prefere um comportamento estável
            e fácil de entender. Em troca, não se adapta à sua memória tão finamente quanto o FSRS e
            tende a gerar mais revisões.
          </p>
        )}

        {/* Retention slider — exclusive to FSRS */}
        {settings.defaultAlgorithm === 'fsrs' && (
          <div className="mt-5">
            <SmoothSlider
              id="s-ret"
              value={settings.defaultDesiredRetention}
              min={0.8}
              max={0.97}
              step={0.005}
              onCommit={(v) => repo.saveSettings({ defaultDesiredRetention: v })}
              label={(v) => `Retenção desejada (FSRS) · ${Math.round(v * 100)}%`}
              footer={
                <div className="flex justify-between mono text-[10px] text-muted mt-1">
                  <span>80% · menos revisões</span>
                  <span>97% · mais retenção</span>
                </div>
              }
            />
          </div>
        )}
      </Section>

      {/* TTS */}
      <TtsSettings />

      {/* Study session */}
      <Section icon={<Eye size={16} />} title="Sessão de estudos">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Mostrar intervalos nos botões</p>
            <p className="text-xs text-muted mt-0.5" style={{ lineHeight: 1.5 }}>
              Exibe a previsão (ex.: "1 min", "6 d") embaixo de cada botão de resposta.
            </p>
          </div>
          <Toggle
            checked={settings.showAnswerIntervals !== false}
            onChange={(v) => repo.saveSettings({ showAnswerIntervals: v })}
          />
        </div>
        <div
          className="flex items-center justify-between gap-4 mt-4 pt-4 border-t"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">Mostrar revisões restantes</p>
            <p className="text-xs text-muted mt-0.5" style={{ lineHeight: 1.5 }}>
              Exibe quantos cards faltam ("Card X de Y") durante a sessão de estudos.
            </p>
          </div>
          <Toggle
            checked={settings.showRemainingCount !== false}
            onChange={(v) => repo.saveSettings({ showRemainingCount: v })}
          />
        </div>
      </Section>

      {/* Appearance */}
      <Section icon={<Palette size={16} />} title="Aparência">
        <p className="text-sm text-muted">
          O Kioku é <b className="text-fg">dark-first</b> por identidade de marca —
          alto contraste, brutalista, com um único acento quente. Um tema claro
          pode chegar em versões futuras.
        </p>
      </Section>

      {/* Data / danger zone */}
      <Section icon={<Database size={16} />} title="Dados">
        <p className="text-sm text-muted mb-3">
          Seus decks, cards e histórico ficam na sua conta (nuvem). Apagar remove
          tudo desta conta e recria os decks de exemplo.
        </p>
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Tem certeza?</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <button
              type="button"
              onClick={resetAll}
              className="btn btn-sm"
              style={{ borderColor: 'var(--accent)', background: 'var(--accent)', color: 'var(--fg)' }}
            >
              Apagar tudo
            </button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            Apagar todos os dados
          </Button>
        )}
      </Section>

      <p className="mono text-[10px] text-muted text-center pb-4">Kioku v1.0.0 · feito com foco em memória</p>
    </div>
  );
}
