import { useMemo } from 'react';
import { dailyPerformance } from './compute';
import type { ReviewLog } from '../../db/types';

interface DailyBarsProps {
  logs: ReviewLog[];
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 mono text-[10px] text-muted">
      <span style={{ width: 10, height: 10, background: color }} />
      {label}
    </span>
  );
}

/** Last 14 days, stacked: green=acertei, amber=difícil, red=errei. */
export function DailyBars({ logs }: DailyBarsProps) {
  const data = useMemo(() => dailyPerformance(logs, 14), [logs]);
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 150 }}>
        {data.map((d) => (
          <div
            key={d.key}
            className="flex-1 flex flex-col justify-end hover-lift"
            style={{ height: '100%' }}
            title={`${d.label} — ${d.total} revisões`}
          >
            {d.total === 0 ? (
              <div style={{ height: 2, background: 'var(--line)' }} />
            ) : (
              <>
                {d.again > 0 && (
                  <div style={{ height: `${(d.again / max) * 100}%`, background: 'var(--accent)' }} />
                )}
                {d.hard > 0 && (
                  <div style={{ height: `${(d.hard / max) * 100}%`, background: 'var(--accent-amber)' }} />
                )}
                {d.goodEasy > 0 && (
                  <div style={{ height: `${(d.goodEasy / max) * 100}%`, background: 'var(--accent-green)' }} />
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center mono text-[8px] text-muted">
            {d.label.slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3">
        <LegendDot color="var(--accent-green)" label="Acertei" />
        <LegendDot color="var(--accent-amber)" label="Difícil" />
        <LegendDot color="var(--accent)" label="Errei" />
      </div>
    </div>
  );
}
