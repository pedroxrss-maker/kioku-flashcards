const DAY_MS = 86_400_000;

/** Epoch ms at local midnight for the day containing `ts` (default: now). */
export function startOfLocalDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Epoch ms at America/Sao_Paulo midnight for the day containing `ts` (default
 * now), regardless of the browser timezone. This is the SAME day boundary the
 * server uses (deck_counts RPC + compute_streak), so the review queue's "new
 * studied today" matches the dashboard's new-card count exactly. DST-correct: it
 * derives the SP wall-clock time-of-day at `ts` and subtracts it.
 */
export function startOfSaoPauloDay(ts: number = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const h = get('hour') % 24; // some environments render midnight as '24'
  const msIntoDay = ((h * 60 + get('minute')) * 60 + get('second')) * 1000 + (ts % 1000);
  return ts - msIntoDay;
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
