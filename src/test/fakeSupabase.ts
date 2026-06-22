/**
 * In-memory fake of the supabase-js client for tests. Implements the small
 * chainable subset the repository uses (select/insert/update/delete/upsert,
 * eq/gte/order/maybeSingle/count) over plain arrays, plus a logged-in auth
 * session. Expose the raw rows via `client.__tables` to assert wire mapping.
 */
export interface FakeTables {
  decks: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  review_logs: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  gamification: Record<string, unknown>[];
  achievement_unlocks: Record<string, unknown>[];
}

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
interface Filter {
  type: 'eq' | 'gte' | 'lte' | 'in';
  col: string;
  val: unknown;
}

class Query {
  private op: Op = 'select';
  private payload: unknown;
  private filters: Filter[] = [];
  private orderSpec: { col: string; ascending: boolean } | null = null;
  private single = false;
  private count = false;
  private rangeSpec: { from: number; to: number } | null = null;
  private limitN: number | null = null;
  private conflictCols: string[] = ['id'];
  private ignoreDup = false;

  constructor(
    private readonly rows: Record<string, unknown>[],
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.count = true;
    return this;
  }
  insert(payload: unknown) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  upsert(payload: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert';
    this.payload = payload;
    if (opts?.onConflict) this.conflictCols = opts.onConflict.split(',').map((s) => s.trim());
    this.ignoreDup = opts?.ignoreDuplicates ?? false;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ type: 'gte', col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ type: 'lte', col, val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ type: 'in', col, val: vals });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending ?? true };
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeSpec = { from, to };
    return this;
  }

  private matches(r: Record<string, unknown>): boolean {
    return this.filters.every((f) => {
      if (f.type === 'eq') return r[f.col] === f.val;
      if (f.type === 'in') return Array.isArray(f.val) && (f.val as unknown[]).includes(r[f.col]);
      const t = new Date(String(r[f.col])).getTime();
      const v = new Date(String(f.val)).getTime();
      return f.type === 'lte' ? t <= v : t >= v; // 'gte'
    });
  }

  private exec() {
    if (this.op === 'insert' || this.op === 'upsert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: Record<string, unknown>[] = [];
      for (const it of items as Record<string, unknown>[]) {
        if (this.op === 'upsert') {
          // Dedupe on the conflict columns (default 'id'); ON CONFLICT either
          // updates the row or, with ignoreDuplicates, leaves it untouched.
          const idx = this.rows.findIndex((r) => this.conflictCols.every((c) => r[c] === it[c]));
          if (idx >= 0) {
            if (!this.ignoreDup) this.rows[idx] = { ...this.rows[idx], ...it };
            continue;
          }
        }
        this.rows.push({ ...it });
        inserted.push(it);
      }
      // ignoreDuplicates upsert returns only the rows actually inserted (so a
      // caller can tell a fresh insert from a no-op), matching PostgREST.
      return { data: this.ignoreDup ? inserted : items, error: null };
    }
    if (this.op === 'update') {
      for (const r of this.rows) {
        if (this.matches(r)) Object.assign(r, this.payload);
      }
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      for (let i = this.rows.length - 1; i >= 0; i -= 1) {
        if (this.matches(this.rows[i])) this.rows.splice(i, 1);
      }
      return { data: null, error: null };
    }
    // select
    let result = this.rows.filter((r) => this.matches(r));
    if (this.orderSpec) {
      const { col, ascending } = this.orderSpec;
      result = [...result].sort((a, b) => {
        const av = a[col] as never;
        const bv = b[col] as never;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return ascending ? cmp : -cmp;
      });
    }
    if (this.rangeSpec) {
      result = result.slice(this.rangeSpec.from, this.rangeSpec.to + 1);
    }
    if (this.limitN != null) result = result.slice(0, this.limitN);
    if (this.count) return { data: null, count: result.length, error: null };
    if (this.single) return { data: result[0] ? { ...result[0] } : null, error: null };
    return { data: result.map((r) => ({ ...r })), error: null };
  }

  then<T>(
    resolve: (value: ReturnType<Query['exec']>) => T,
    reject?: (reason: unknown) => T,
  ): Promise<T> {
    return Promise.resolve()
      .then(() => this.exec())
      .then(resolve, reject);
  }
}

export interface FakeSupabase {
  __tables: FakeTables;
  from: (table: keyof FakeTables) => Query;
  auth: Record<string, (...args: unknown[]) => unknown>;
}

export function createFakeSupabase(opts?: {
  userId?: string;
  displayName?: string;
  email?: string;
}): FakeSupabase {
  const userId = opts?.userId ?? 'user-1';
  const displayName = opts?.displayName ?? 'Pedro';
  const email = opts?.email ?? 'pedro@example.com';

  const tables: FakeTables = {
    decks: [],
    cards: [],
    review_logs: [],
    profiles: [{ id: userId, display_name: displayName, daily_goal: 40, settings: {} }],
    gamification: [],
    achievement_unlocks: [],
  };

  const user = { id: userId, email, user_metadata: { display_name: displayName } };

  return {
    __tables: tables,
    from: (table) => new Query(tables[table]),
    auth: {
      getSession: async () => ({ data: { session: { user } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { user }, error: null }),
      signUp: async () => ({ data: { user }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}
