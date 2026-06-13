import { useMemo } from 'react';
import { Lock, Trophy } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/Panel';
import { useAchievements, useGamification } from '../db/hooks';
import { levelProgress } from '../features/gamification/xp';
import {
  ACHIEVEMENTS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from '../features/gamification/achievements';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export function Awards() {
  const gamification = useGamification();
  const unlocks = useAchievements();

  const earned = useMemo(
    () => new Map(unlocks.map((u) => [u.key, u.unlockedAt])),
    [unlocks],
  );
  const totalXp = gamification?.totalXp ?? 0;
  const prog = levelProgress(totalXp);
  const earnedCount = ACHIEVEMENTS.filter((a) => earned.has(a.key)).length;

  return (
    <div className="rise flex flex-col gap-7 [&>*]:min-w-0">
      <PageHeader title="Conquistas" subtitle="Seu progresso e medalhas no Kioku." />

      {/* XP / level bar */}
      <Panel className="p-5 md:p-6">
        <div className="flex items-center gap-4 md:gap-5">
          <span
            className="shrink-0 grid place-items-center rounded-full"
            style={{
              width: 64,
              height: 64,
              background: 'var(--accent-soft)',
              border: '2px solid var(--accent)',
            }}
          >
            <span className="display leading-none" style={{ fontSize: 26, color: 'var(--accent)' }}>
              {prog.level}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-end justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="mono text-[11px] text-muted">Nível</p>
                <p className="display leading-none" style={{ fontSize: 22 }}>
                  Nível {prog.level}
                </p>
              </div>
              <p className="mono text-[11px] text-muted shrink-0">
                {earnedCount}/{ACHIEVEMENTS.length} conquistas
              </p>
            </div>
            <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
              <div
                style={{
                  width: `${Math.round(prog.pct * 100)}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  transition: 'width .5s cubic-bezier(0.22,1,0.36,1)',
                }}
              />
            </div>
            <p className="mono text-[10px] text-muted mt-1.5">
              {prog.current}/{prog.needed} XP para o nível {prog.level + 1} · {totalXp} XP no total
            </p>
          </div>
        </div>
      </Panel>

      {/* Achievements grouped by category */}
      {CATEGORY_ORDER.map((cat) => {
        const items = ACHIEVEMENTS.filter((a) => a.category === cat);
        if (items.length === 0) return null;
        const got = items.filter((a) => earned.has(a.key)).length;
        return (
          <section key={cat}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="mono text-sm text-muted">{CATEGORY_LABELS[cat]}</h2>
              <span className="mono text-[11px] text-muted">
                {got}/{items.length}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((a) => {
                const unlockedAt = earned.get(a.key);
                const isEarned = unlockedAt != null;
                return (
                  <div
                    key={a.key}
                    className="surface p-4 flex items-start gap-3"
                    style={{
                      borderColor: isEarned ? 'var(--accent)' : 'var(--line)',
                      opacity: isEarned ? 1 : 0.62,
                    }}
                  >
                    <span
                      className="shrink-0 grid place-items-center rounded-[var(--r-md)]"
                      style={{
                        width: 40,
                        height: 40,
                        background: isEarned ? 'var(--accent-soft)' : 'var(--surface-2)',
                        color: isEarned ? 'var(--accent)' : 'var(--muted)',
                      }}
                    >
                      {isEarned ? <Trophy size={19} /> : <Lock size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{a.name}</p>
                      <p className="text-xs text-muted mt-0.5" style={{ lineHeight: 1.45 }}>
                        {a.description}
                      </p>
                      {isEarned && (
                        <p className="mono text-[10px] mt-1.5" style={{ color: 'var(--accent-green)' }}>
                          Desbloqueada em {dateFmt.format(new Date(unlockedAt))}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
