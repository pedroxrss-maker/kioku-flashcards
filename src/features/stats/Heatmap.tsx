import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { buildHeatmap } from './compute';
import type { HeatCell } from './compute';
import { computeStreak } from '../../lib/greeting';
import { dayKey } from '../../lib/date';
import type { ReviewLog } from '../../db/types';

const TIER_PCT = [0, 25, 45, 70, 100];

function cellBg(cell: HeatCell): string {
  if (cell.tier === 0) return 'var(--line)';
  return `color-mix(in srgb, var(--accent) ${TIER_PCT[cell.tier]}%, transparent)`;
}

const fmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function motivation(streak: number): string {
  if (streak === 0) return 'Vamos recomeçar. Você consegue!';
  if (streak < 3) return 'Bom começo — continue!';
  if (streak < 7) return 'Continue assim!';
  if (streak < 30) return 'Você está pegando fogo!';
  return 'Imparável. Que sequência!';
}

interface HeatmapProps {
  logs: ReviewLog[];
}

/** GitHub-style review calendar — last 16 weeks — with the streak flame + a
 *  short motivational line alongside it. */
export function Heatmap({ logs }: HeatmapProps) {
  const columns = useMemo(() => buildHeatmap(logs, 16), [logs]);
  const streak = useMemo(
    () => computeStreak(new Set(logs.map((l) => dayKey(l.reviewedAt)))),
    [logs],
  );

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-5">
      <div className="flex-1 min-w-0">
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-[3px]" style={{ minWidth: 'min-content' }}>
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((cell) => (
                  <div
                    key={cell.key}
                    title={`${cell.count} ${cell.count === 1 ? 'revisão' : 'revisões'} · ${fmt.format(new Date(cell.date))}`}
                    style={{
                      width: 13,
                      height: 13,
                      background: cellBg(cell),
                      border: '1px solid var(--bg)',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3 mono text-[10px] text-muted">
          <span>Menos</span>
          {[0, 1, 2, 3, 4].map((t) => (
            <span
              key={t}
              style={{
                width: 11,
                height: 11,
                background:
                  t === 0 ? 'var(--line)' : `color-mix(in srgb, var(--accent) ${TIER_PCT[t]}%, transparent)`,
              }}
            />
          ))}
          <span>Mais</span>
        </div>
      </div>

      {/* Streak flame + motivation */}
      <div
        className="flex items-center gap-3 shrink-0 lg:flex-col lg:text-center lg:w-44 lg:gap-2 lg:border-l lg:pl-5"
        style={{ borderColor: 'var(--line)' }}
      >
        <Flame size={40} className="flame-anim" style={{ color: 'var(--accent)' }} fill="var(--accent)" />
        <div>
          <p className="display" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
            {streak} <span className="text-muted" style={{ fontSize: 15 }}>{streak === 1 ? 'dia' : 'dias'}</span>
          </p>
          <p className="text-sm text-muted mt-1" style={{ lineHeight: 1.4 }}>{motivation(streak)}</p>
        </div>
      </div>
    </div>
  );
}
