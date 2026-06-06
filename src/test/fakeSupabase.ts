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
}

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
interface Filter {
  type: 'eq' | 'gte';
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
  upsert(payload: unknown) {
    this.op = 'upsert';
    this.payload = payload;
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
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending ?? true };
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  limit() {
    return this;
  }

  private matches(r: Record<string, unknown>): boolean {
    return this.filters.every((f) => {
      if (f.type === 'eq') return r[f.col] === f.val;
      return new Date(String(r[f.col])).getTime() >= new Date(String(f.val)).getTime();
    });
  }

  private exec() {
    if (this.op === 'insert' || this.op === 'upsert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const it of items as Record<string, unknown>[]) {
        if (this.op === 'upsert') {
          const idx = this.rows.findIndex((r) => r.id === it.id);
          if (idx >= 0) {
            this.rows[idx] = { ...this.rows[idx], ...it };
            continue;
          }
        }
        this.rows.push({ ...it });
      }
      return { data: items, error: null };
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
