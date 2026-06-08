import { DAY_MS, dayKey, startOfLocalDay } from '../../lib/date';
import type { Deck, ReviewLog } from '../../db/types';

/* --------------------------------------------------------------- heatmap -- */

export interface HeatCell {
  date: number;
  key: string;
  count: number;
  tier: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

export function reviewsByDay(logs: ReviewLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) {
    const k = dayKey(l.reviewedAt);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function tierFor(count: number): HeatCell['tier'] {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 10) return 2;
  if (count < 20) return 3;
  return 4;
}

/** Columns (weeks) of 7 day-cells, Sunday-aligned, ending today. */
export function buildHeatmap(logs: ReviewLog[], weeks = 16): HeatCell[][] {
  const byDay = reviewsByDay(logs);
  const today = startOfLocalDay();
  const start = new Date(today - (weeks * 7 - 1) * DAY_MS);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday

  const cells: HeatCell[] = [];
  for (let t = start.getTime(); t <= today; t += DAY_MS) {
    const key = dayKey(t);
    const count = byDay.get(key) ?? 0;
    cells.push({ date: t, key, count, tier: tierFor(count), future: false });
  }

  const columns: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    columns.push(cells.slice(i, i + 7));
  }
  return columns;
}

/** Full calendar year (Jan 1 -> Dec 31 of `year`), Sunday-aligned columns.
 *  Days after today are flagged `future`. */
export function buildYear(logs: ReviewLog[], year: number): HeatCell[][] {
  const byDay = reviewsByDay(logs);
  const todayKey = dayKey(startOfLocalDay());
  const start = new Date(year, 0, 1);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // back to the Sunday on/before Jan 1
  const end = new Date(year, 11, 31).getTime();

  const cells: HeatCell[] = [];
  for (let t = start.getTime(); t <= end; t += DAY_MS) {
    const key = dayKey(t);
    const count = byDay.get(key) ?? 0;
    cells.push({ date: t, key, count, tier: tierFor(count), future: key > todayKey });
  }
  const columns: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));
  return columns;
}

/** Short month label for each heatmap column (only where a new month begins). */
export function monthLabels(columns: HeatCell[][]): string[] {
  const fmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  let last = -1;
  return columns.map((col) => {
    const d = col[0]?.date;
    if (d == null) return '';
    const m = new Date(d).getMonth();
    if (m !== last) {
      last = m;
      return fmt.format(new Date(d)).replace('.', '');
    }
    return '';
  });
}

export interface MonthCell extends HeatCell {
  day: number;
}

/** A single calendar month as day cells, padded with leading nulls to a Sunday. */
export function buildMonth(logs: ReviewLog[], year: number, month: number): (MonthCell | null)[] {
  const byDay = reviewsByDay(logs);
  const startPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(startOfLocalDay());
  const cells: (MonthCell | null)[] = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(year, month, d).getTime();
    const key = dayKey(date);
    const count = byDay.get(key) ?? 0;
    cells.push({ date, key, count, tier: tierFor(count), future: key > todayKey, day: d });
  }
  return cells;
}

/** Mean cards/day over the day cells that aren't in the future. */
export function dailyAverage(columns: HeatCell[][]): number {
  let sum = 0;
  let days = 0;
  for (const col of columns) {
    for (const cell of col) {
      if (cell.future) continue;
      sum += cell.count;
      days += 1;
    }
  }
  return days ? sum / days : 0;
}

/* ----------------------------------------------------- daily performance -- */

export interface DayPerf {
  key: string;
  label: string;
  again: number;
  hard: number;
  goodEasy: number;
  total: number;
}

export function dailyPerformance(logs: ReviewLog[], days = 14): DayPerf[] {
  const today = startOfLocalDay();
  const buckets = new Map<string, DayPerf>();
  const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

  for (let i = days - 1; i >= 0; i -= 1) {
    const t = today - i * DAY_MS;
    const key = dayKey(t);
    buckets.set(key, { key, label: fmt.format(new Date(t)), again: 0, hard: 0, goodEasy: 0, total: 0 });
  }
  for (const l of logs) {
    const b = buckets.get(dayKey(l.reviewedAt));
    if (!b) continue;
    if (l.rating === 'again') b.again += 1;
    else if (l.rating === 'hard') b.hard += 1;
    else b.goodEasy += 1;
    b.total += 1;
  }
  return [...buckets.values()];
}

/* ---------------------------------------------------------------- sessions */

export interface Session {
  deckId: string;
  deckName: string;
  color: string;
  start: number;
  end: number;
  durationMs: number;
  count: number;
  scorePct: number;
}

const SESSION_GAP_MS = 30 * 60_000;

/** Group logs into study sessions (per deck, split on >30min gaps). */
export function sessionsFromLogs(
  logs: ReviewLog[],
  decks: Deck[],
  limit = 12,
): Session[] {
  const deckMap = new Map(decks.map((d) => [d.id, d]));
  const sorted = [...logs].sort((a, b) => a.reviewedAt - b.reviewedAt);

  const sessions: Session[] = [];
  let cur: (Session & { again: number }) | null = null;

  for (const l of sorted) {
    const deck = deckMap.get(l.deckId);
    const sameSession =
      cur &&
      cur.deckId === l.deckId &&
      l.reviewedAt - cur.end <= SESSION_GAP_MS;

    if (!sameSession) {
      if (cur) sessions.push(finalize(cur));
      cur = {
        deckId: l.deckId,
        deckName: deck?.name ?? 'Deck removido',
        color: deck?.color ?? '#9a9a96',
        start: l.reviewedAt,
        end: l.reviewedAt,
        durationMs: 0,
        count: 0,
        scorePct: 0,
        again: 0,
      };
    }
    if (!cur) continue;
    cur.end = l.reviewedAt;
    cur.durationMs += l.durationMs;
    cur.count += 1;
    if (l.rating === 'again') cur.again += 1;
  }
  if (cur) sessions.push(finalize(cur));

  return sessions.sort((a, b) => b.start - a.start).slice(0, limit);
}

function finalize(s: Session & { again: number }): Session {
  const { again, ...rest } = s;
  return {
    ...rest,
    scorePct: s.count ? Math.round(((s.count - again) / s.count) * 100) : 0,
  };
}

/* ----------------------------------------------------------------- summary */

export interface StatsSummary {
  totalReviews: number;
  accuracyPct: number;
  reviewsToday: number;
}

/** Longest run of consecutive local days that each had >=1 review. */
export function longestStreak(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) return 0;
  const days = [...dayKeys].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = new Date(`${days[i - 1]}T00:00:00`).getTime();
    const cur = new Date(`${days[i]}T00:00:00`).getTime();
    if (Math.round((cur - prev) / DAY_MS) === 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

export function reviewsSince(logs: ReviewLog[], since: number): number {
  let n = 0;
  for (const l of logs) if (l.reviewedAt >= since) n += 1;
  return n;
}

/** % of reviews rated good/easy within the window since `since`. */
export function accuracySince(logs: ReviewLog[], since: number): number {
  let total = 0;
  let ok = 0;
  for (const l of logs) {
    if (l.reviewedAt < since) continue;
    total += 1;
    if (l.rating === 'good' || l.rating === 'easy') ok += 1;
  }
  return total ? Math.round((ok / total) * 100) : 0;
}

export function studiedToday(logs: ReviewLog[]): number {
  return reviewsSince(logs, startOfLocalDay());
}

export function decksCreatedThisMonth(decks: Deck[]): number {
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return decks.filter((x) => x.createdAt >= monthStart).length;
}

export interface ActivityItem {
  kind: 'session' | 'deck';
  main: string;
  sub: string;
  time: number;
  color: string;
}

/** Recent-activity feed: completed study sessions + created decks, newest first. */
export function recentActivity(
  logs: ReviewLog[],
  decks: Deck[],
  limit = 4,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const s of sessionsFromLogs(logs, decks, 50)) {
    items.push({
      kind: 'session',
      main: `Você estudou ${s.count} ${s.count === 1 ? 'card' : 'cards'}`,
      sub: `em ${s.deckName}`,
      time: s.end,
      color: s.color,
    });
  }
  for (const d of decks) {
    items.push({ kind: 'deck', main: 'Novo deck criado', sub: d.name, time: d.createdAt, color: d.color });
  }
  return items.sort((a, b) => b.time - a.time).slice(0, limit);
}

export function statsSummary(logs: ReviewLog[]): StatsSummary {
  const todayStart = startOfLocalDay();
  let again = 0;
  let reviewsToday = 0;
  for (const l of logs) {
    if (l.rating === 'again') again += 1;
    if (l.reviewedAt >= todayStart) reviewsToday += 1;
  }
  return {
    totalReviews: logs.length,
    accuracyPct: logs.length ? Math.round(((logs.length - again) / logs.length) * 100) : 0,
    reviewsToday,
  };
}
