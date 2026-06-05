import { useState } from 'react';
import type { ReactNode } from 'react';
import { Brain, Database, Palette, SlidersHorizontal, SquareStack, User } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { TtsSettings } from '../features/tts/TtsSettings';
import { useSettings } from '../db/hooks';
import { repo } from '../db/repositories';
import { seedIfEmpty } from '../db/seed';
import { cn } from '../lib/cn';
import type { Algorithm, ButtonCount } from '../db/types';

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

  if (!settings) {
    return (
      <div className="rise">
        <PageHeader title="Configurações" />
        <p className="mono text-muted text-sm">Carregando…</p>
      </div>
    );
  }

  async function resetAll() {
    await repo.resetAll();
    await seedIfEmpty();
    window.location.href = '/';
  }

  return (
    <div className="rise flex flex-col gap-6 max-w-3xl">
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
            <input
              id="s-rev"
              type="number"
              min={0}
              className="field"
              value={settings.reviewsPerDay}
              onChange={(e) => repo.saveSettings({ reviewsPerDay: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        </div>
        <p className="text-xs text-muted mt-3">
          Decks existentes mantêm seus próprios limites (ajuste em cada deck).
        </p>
      </Section>

      {/* Default algorithm */}
      <Section icon={<Brain size={16} />} title="Algoritmo padrão">
        <div className="grid grid-cols-2 gap-2">
          {(['fsrs', 'sm2'] as Algorithm[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => repo.saveSettings({ defaultAlgorithm: a })}
              className={cn(
                'rounded-[var(--r-sm)] border px-4 py-3 text-left transition-colors',
                settings.defaultAlgorithm === a
                  ? 'border-[color:var(--accent)] bg-[color:var(--surface-2)]'
                  : 'border-[color:var(--line-strong)] hover:bg-[color:var(--surface-2)]',
              )}
            >
              <span className="mono text-sm block mb-0.5">{a === 'fsrs' ? 'FSRS' : 'SM-2'}</span>
              <span className="text-xs text-muted">
                {a === 'fsrs' ? 'Moderno · padrão' : 'Clássico (Anki)'}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-3">
          O <b className="text-fg">FSRS</b> é o algoritmo moderno e mais eficiente:
          agenda revisões a partir da estabilidade e da dificuldade da memória,
          reduzindo revisões desnecessárias. O <b className="text-fg">SM-2</b> é o
          clássico do Anki, previsível e simples.
        </p>

        <div className="mt-5">
          <label className="field-label" htmlFor="s-ret">
            Retenção desejada (FSRS) · {Math.round(settings.defaultDesiredRetention * 100)}%
          </label>
          <input
            id="s-ret"
            type="range"
            min={0.8}
            max={0.97}
            step={0.01}
            value={settings.defaultDesiredRetention}
            onChange={(e) => repo.saveSettings({ defaultDesiredRetention: Number(e.target.value) })}
            className="w-full accent-[color:var(--accent)]"
          />
          <div className="flex justify-between mono text-[10px] text-muted mt-1">
            <span>80% · menos revisões</span>
            <span>97% · mais retenção</span>
          </div>
        </div>
      </Section>

      {/* King of Buttons */}
      <Section icon={<SquareStack size={16} />} title="Botões de resposta padrão (King of Buttons)">
        <div className="grid grid-cols-3 gap-2">
          {([2, 3, 4] as ButtonCount[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => repo.saveSettings({ defaultButtonCount: n })}
              className={cn(
                'rounded-[var(--r-sm)] border px-3 py-3 transition-colors text-center',
                settings.defaultButtonCount === n
                  ? 'border-[color:var(--accent)] bg-[color:var(--surface-2)]'
                  : 'border-[color:var(--line-strong)] hover:bg-[color:var(--surface-2)]',
              )}
            >
              <span className="display text-lg block">{n}</span>
              <span className="mono text-[11px] text-muted">
                {n === 2 ? 'Errei/Acertei' : n === 3 ? '+ Difícil' : '+ Bom/Fácil'}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* TTS */}
      <TtsSettings />

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
          Todos os dados ficam no seu navegador (IndexedDB). Apagar remove decks,
          cards, histórico e mídias, e recria os decks de exemplo.
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
