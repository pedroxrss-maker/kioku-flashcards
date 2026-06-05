const DAY_MS = 86_400_000;

/** Epoch ms at local midnight for the day containing `ts` (default: now). */
export function startOfLocalDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local 'YYYY-MM-DD' key for a timestamp. */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(ts: number, days: number): number {
  return ts + days * DAY_MS;
}

/** Whole local days between two timestamps (a before b → positive). */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfLocalDay(b) - startOfLocalDay(a)) / DAY_MS);
}

export { DAY_MS };
