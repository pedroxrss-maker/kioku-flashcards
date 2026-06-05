import type { ReactNode } from 'react';
import { Panel } from './Panel';

interface StatTileProps {
  label: string;
  value: ReactNode;
  caption?: string;
  accent?: string;
}

/** Big Archivo number + mono caption — the brand stat tile. */
export function StatTile({ label, value, caption, accent }: StatTileProps) {
  return (
    <Panel className="p-5">
      <p className="mono text-[10px] text-muted mb-1">{label}</p>
      <p className="display" style={{ fontSize: 38, color: accent }}>
        {value}
      </p>
      {caption && <p className="text-xs text-muted mt-0.5">{caption}</p>}
    </Panel>
  );
}
