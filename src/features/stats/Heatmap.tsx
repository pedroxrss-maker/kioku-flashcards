import { useMemo } from 'react';
import { buildHeatmap } from './compute';
import type { HeatCell } from './compute';
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

interface HeatmapProps {
  logs: ReviewLog[];
}

/** GitHub-style review calendar — last 16 weeks, accent intensity. */
export function Heatmap({ logs }: HeatmapProps) {
  const columns = useMemo(() => buildHeatmap(logs, 16), [logs]);

  return (
    <div>
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
  );
}
