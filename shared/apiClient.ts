/**
 * Small own client for the project's API (Flux component "api"): PostgREST under /rest/v1,
 * wallet (SIWE) sessions under /auth/v1 and server functions under /functions/v1.
 *
 * It replaces @supabase/supabase-js: only the subset this app uses is implemented
 * (from/select/insert/upsert/update/delete with eq/neq/gt/gte/lt/lte/in/is/not/match/like/ilike,
 * order/limit/range/single/maybeSingle, count, rpc, functions.invoke and the session API).
 * Results never throw: `{ data, error }` like before, so existing call sites keep working.
 * Runs in the browser and in Node (the API bundles it for its server functions).
 */

export interface ApiUser {
  id: string;
  aud?: string;
  role?: string;
  email?: string;
  created_at?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ApiSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type: string;
  user: ApiUser;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: string | null;
  hint?: string | null;
  /** The raw response (functions.invoke errors), like supabase-js FunctionsHttpError.context. */
  context?: Response;
  constructor(message: string, status: number, extra: Partial<ApiError> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    Object.assign(this, extra);
  }
}

export interface ApiResult<T> {
  data: T | null;
  error: ApiError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ClientOptions {
  auth?: {
    storage?: Storage;
    storageKey?: string;
    persistSession?: boolean;
    autoRefreshToken?: boolean;
  };
  global?: { headers?: Record<string, string>; fetch?: typeof fetch };
}

export type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
type AuthListener = (event: AuthEvent, session: ApiSession | null) => void;

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

function jwtExp(token: string): number | undefined {
  try {
    const part = token.split('.')[1];
    const json =
      typeof atob === 'function'
        ? atob(part.replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(part, 'base64url').toString('utf8');
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp : undefined;
  } catch {
    return undefined;
  }
}

/** PostgREST filter value encoding (quotes values that contain reserved characters). */
function pgValue(v: unknown): string {
  if (v === null) return 'null';
  const s = String(v);
  return /[,()"\\:]/.test(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    /* not JSON */
  }
  const msg = String(body.message ?? body.msg ?? body.error_description ?? body.error ?? (res.statusText || `HTTP ${res.status}`));
  return new ApiError(msg, res.status, {
    code: body.code !== undefined ? String(body.code) : (body.error_code as string | undefined),
    details: (body.details as string) ?? null,
    hint: (body.hint as string) ?? null,
  });
}

type Method = 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'DELETE';
type CountOpt = 'exact' | 'planned' | 'estimated';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class QueryBuilder<T = any> implements PromiseLike<ApiResult<T>> {
  private method: Method = 'GET';
  private params = new URLSearchParams();
  private prefer: string[] = [];
  private body: unknown;
  private returning = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private orders: string[] = [];
  private signal?: AbortSignal;

  constructor(
    private client: ApiClient,
    private path: string,
    method?: Method,
    body?: unknown,
  ) {
    if (method) this.method = method;
    this.body = body;
  }

  select(columns = '*', opts: { count?: CountOpt; head?: boolean } = {}): QueryBuilder<T> {
    this.params.set('select', columns.replace(/\s+(?=([^"]*"[^"]*")*[^"]*$)/g, ''));
    if (opts.count) this.prefer.push(`count=${opts.count}`);
    if (this.method === 'GET' && opts.head) this.method = 'HEAD';
    if (this.method !== 'GET' && this.method !== 'HEAD') this.returning = true;
    return this;
  }
  insert(values: unknown, opts: { count?: CountOpt; defaultToNull?: boolean } = {}): QueryBuilder<T> {
    this.method = 'POST';
    this.body = values;
    if (opts.count) this.prefer.push(`count=${opts.count}`);
    this.setColumns(values, opts.defaultToNull !== true);
    return this;
  }
  upsert(values: unknown, opts: { onConflict?: string; ignoreDuplicates?: boolean; count?: CountOpt } = {}): QueryBuilder<T> {
    this.method = 'POST';
    this.body = values;
    this.prefer.push(`resolution=${opts.ignoreDuplicates ? 'ignore' : 'merge'}-duplicates`);
    if (opts.onConflict) this.params.set('on_conflict', opts.onConflict.replace(/\s/g, ''));
    if (opts.count) this.prefer.push(`count=${opts.count}`);
    this.setColumns(values, true);
    return this;
  }
  /** Bulk writes with rows that have different keys need an explicit column list. */
  private setColumns(values: unknown, missingDefault: boolean) {
    if (!Array.isArray(values) || values.length === 0) return;
    const cols = new Set<string>();
    for (const row of values) if (row && typeof row === 'object') for (const k of Object.keys(row)) cols.add(k);
    this.params.set('columns', [...cols].map((c) => `"${c}"`).join(','));
    if (missingDefault) this.prefer.push('missing=default');
  }
  update(values: unknown, opts: { count?: CountOpt } = {}): QueryBuilder<T> {
    this.method = 'PATCH';
    this.body = values;
    if (opts.count) this.prefer.push(`count=${opts.count}`);
    return this;
  }
  delete(opts: { count?: CountOpt } = {}): QueryBuilder<T> {
    this.method = 'DELETE';
    if (opts.count) this.prefer.push(`count=${opts.count}`);
    return this;
  }

  private f(col: string, op: string, v: unknown): QueryBuilder<T> {
    this.params.append(col, `${op}.${v}`);
    return this;
  }
  eq(col: string, v: unknown) { return this.f(col, 'eq', pgValue(v)); }
  neq(col: string, v: unknown) { return this.f(col, 'neq', pgValue(v)); }
  gt(col: string, v: unknown) { return this.f(col, 'gt', pgValue(v)); }
  gte(col: string, v: unknown) { return this.f(col, 'gte', pgValue(v)); }
  lt(col: string, v: unknown) { return this.f(col, 'lt', pgValue(v)); }
  lte(col: string, v: unknown) { return this.f(col, 'lte', pgValue(v)); }
  like(col: string, v: string) { return this.f(col, 'like', pgValue(v)); }
  ilike(col: string, v: string) { return this.f(col, 'ilike', pgValue(v)); }
  is(col: string, v: null | boolean) { return this.f(col, 'is', String(v)); }
  in(col: string, vs: readonly unknown[]) { return this.f(col, 'in', `(${vs.map(pgValue).join(',')})`); }
  not(col: string, op: string, v: unknown) {
    const val = op === 'in' && Array.isArray(v) ? `(${v.map(pgValue).join(',')})` : String(v);
    return this.f(col, `not.${op}`, val);
  }
  match(q: Record<string, unknown>) {
    for (const [k, v] of Object.entries(q)) this.eq(k, v);
    return this;
  }
  filter(col: string, op: string, v: unknown) { return this.f(col, op, String(v)); }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const dir = opts.ascending === false ? 'desc' : 'asc';
    const nulls = opts.nullsFirst === undefined ? '' : opts.nullsFirst ? '.nullsfirst' : '.nullslast';
    this.orders.push(`${col}.${dir}${nulls}`);
    return this;
  }
  limit(n: number) {
    this.params.set('limit', String(n));
    return this;
  }
  range(from: number, to: number) {
    this.params.set('offset', String(from));
    this.params.set('limit', String(to - from + 1));
    return this;
  }
  single() {
    this.mode = 'single';
    return this as unknown as QueryBuilder<T extends (infer R)[] ? R : T>;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this as unknown as QueryBuilder<(T extends (infer R)[] ? R : T) | null>;
  }
  abortSignal(s: AbortSignal) {
    this.signal = s;
    return this;
  }
  /** Compatibility no-op (typing helper in supabase-js). */
  returns<R>() {
    return this as unknown as QueryBuilder<R>;
  }

  async execute(): Promise<ApiResult<T>> {
    const q = new URLSearchParams(this.params);
    if (this.orders.length) q.set('order', this.orders.join(','));
    const prefer = [...this.prefer];
    if (this.method === 'POST' || this.method === 'PATCH' || this.method === 'DELETE') {
      prefer.push(this.returning ? 'return=representation' : 'return=minimal');
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.mode === 'single') headers.Accept = 'application/vnd.pgrst.object+json';
    if (this.body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer.length) headers.Prefer = prefer.join(',');
    const qs = q.toString();
    try {
      const res = await this.client.request(`${this.path}${qs ? `?${qs}` : ''}`, {
        method: this.method,
        headers,
        body: this.body === undefined ? undefined : JSON.stringify(this.body),
        signal: this.signal,
      });
      const range = res.headers.get('content-range');
      const total = range && range.includes('/') ? range.split('/')[1] : null;
      const count = total && total !== '*' ? Number(total) : null;
      if (!res.ok) return { data: null, error: await parseError(res), count, status: res.status, statusText: res.statusText };
      const text = this.method === 'HEAD' ? '' : await res.text();
      let data: unknown = text ? JSON.parse(text) : null;
      if (this.mode === 'maybe' && Array.isArray(data)) {
        if (data.length > 1) {
          return {
            data: null,
            error: new ApiError('JSON object requested, multiple (or no) rows returned', 406, { code: 'PGRST116' }),
            count,
            status: 406,
            statusText: 'Not Acceptable',
          };
        }
        data = data[0] ?? null;
      }
      return { data: data as T, error: null, count, status: res.status, statusText: res.statusText };
    } catch (e) {
      return { data: null, error: new ApiError((e as Error).message || 'network error', 0), count: null, status: 0, statusText: '' };
    }
  }

  then<A = ApiResult<T>, B = never>(
    onfulfilled?: ((value: ApiResult<T>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class AuthApi {
  private session: ApiSession | null = null;
  private listeners = new Set<AuthListener>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshing: Promise<ApiSession | null> | null = null;
  private loaded = false;

  constructor(
    private client: ApiClient,
    private storage: Storage,
    private storageKey: string,
    private autoRefresh: boolean,
  ) {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key !== this.storageKey) return;
        this.loaded = false;
        const s = this.load();
        this.emit(s ? 'TOKEN_REFRESHED' : 'SIGNED_OUT', s);
      });
    }
  }

  private load(): ApiSession | null {
    if (this.loaded) return this.session;
    this.loaded = true;
    try {
      const raw = this.storage.getItem(this.storageKey);
      this.session = raw ? (JSON.parse(raw) as ApiSession) : null;
    } catch {
      this.session = null;
    }
    this.schedule();
    return this.session;
  }

  private save(s: ApiSession | null) {
    this.session = s;
    this.loaded = true;
    try {
      if (s) this.storage.setItem(this.storageKey, JSON.stringify(s));
      else this.storage.removeItem(this.storageKey);
    } catch {
      /* storage full / disabled */
    }
    this.schedule();
  }

  private schedule() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    const s = this.session;
    if (!this.autoRefresh || !s?.expires_at || typeof window === 'undefined') return;
    const ms = Math.max(5_000, (s.expires_at - 60) * 1000 - Date.now());
    this.refreshTimer = setTimeout(() => void this.refreshSession(), Math.min(ms, 2 ** 31 - 1));
  }

  private emit(event: AuthEvent, s: ApiSession | null) {
    for (const l of [...this.listeners]) {
      try {
        l(event, s);
      } catch {
        /* listener errors must not break auth */
      }
    }
  }

  /** Access token of the current session (refreshed when it is about to expire). */
  async accessToken(): Promise<string | null> {
    const { data } = await this.getSession();
    return data.session?.access_token ?? null;
  }

  async getSession(): Promise<{ data: { session: ApiSession | null }; error: ApiError | null }> {
    let s = this.load();
    if (s?.expires_at && s.expires_at * 1000 - Date.now() < 30_000) s = await this.refreshSession().then((r) => r.data.session);
    return { data: { session: s }, error: null };
  }

  async refreshSession(): Promise<{ data: { session: ApiSession | null }; error: ApiError | null }> {
    const cur = this.load();
    if (!cur?.refresh_token) return { data: { session: null }, error: null };
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const res = await this.client
          .request('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: cur.refresh_token }),
            anonymous: true,
          })
          .catch(() => null);
        if (!res) return cur; // offline: keep the session, retry later
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500) {
            this.save(null);
            this.emit('SIGNED_OUT', null);
            return null;
          }
          return cur;
        }
        const next = this.normalize((await res.json()) as Partial<ApiSession>, cur.user);
        this.save(next);
        this.emit('TOKEN_REFRESHED', next);
        return next;
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return { data: { session: await this.refreshing }, error: null };
  }

  private normalize(raw: Partial<ApiSession>, fallbackUser?: ApiUser): ApiSession {
    const exp = raw.expires_at ?? jwtExp(raw.access_token ?? '') ?? (raw.expires_in ? Math.floor(Date.now() / 1000) + raw.expires_in : undefined);
    return {
      access_token: raw.access_token ?? '',
      refresh_token: raw.refresh_token ?? '',
      token_type: raw.token_type ?? 'bearer',
      expires_in: raw.expires_in,
      expires_at: exp,
      user: (raw.user as ApiUser) ?? fallbackUser ?? ({ id: '', app_metadata: {}, user_metadata: {} } as ApiUser),
    };
  }

  async getUser(jwt?: string): Promise<{ data: { user: ApiUser | null }; error: ApiError | null }> {
    const token = jwt ?? (await this.accessToken());
    if (!token) return { data: { user: null }, error: new ApiError('Auth session missing', 401) };
    try {
      const res = await this.client.request('/auth/v1/user', { headers: { Authorization: `Bearer ${token}` }, anonymous: true });
      if (!res.ok) return { data: { user: null }, error: await parseError(res) };
      return { data: { user: (await res.json()) as ApiUser }, error: null };
    } catch (e) {
      return { data: { user: null }, error: new ApiError((e as Error).message, 0) };
    }
  }

  /** Verifies a token with the API and returns its main claims (server functions). */
  async getClaims(jwt?: string): Promise<{ data: { claims: Record<string, unknown> } | null; error: ApiError | null }> {
    const { data, error } = await this.getUser(jwt);
    if (error || !data.user) return { data: null, error: error ?? new ApiError('invalid token', 401) };
    return { data: { claims: { sub: data.user.id, role: data.user.role ?? 'authenticated', aud: data.user.aud } }, error: null };
  }

  async setSession(t: { access_token: string; refresh_token: string }): Promise<{ data: { session: ApiSession | null }; error: ApiError | null }> {
    const { data, error } = await this.getUser(t.access_token);
    if (error || !data.user) return { data: { session: null }, error: error ?? new ApiError('invalid session', 401) };
    const s = this.normalize({ ...t, user: data.user });
    this.save(s);
    this.emit('SIGNED_IN', s);
    return { data: { session: s }, error: null };
  }

  async signOut(opts: { scope?: 'global' | 'local' | 'others' } = {}): Promise<{ error: ApiError | null }> {
    const s = this.load();
    if (s && opts.scope !== 'local') {
      await this.client
        .request(`/auth/v1/logout?scope=${opts.scope ?? 'global'}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${s.access_token}` },
          anonymous: true,
        })
        .catch(() => null);
    }
    this.save(null);
    this.emit('SIGNED_OUT', null);
    return { error: null };
  }

  onAuthStateChange(cb: AuthListener): { data: { subscription: { unsubscribe: () => void } } } {
    this.listeners.add(cb);
    queueMicrotask(() => {
      if (this.listeners.has(cb)) cb('INITIAL_SESSION', this.load());
    });
    return { data: { subscription: { unsubscribe: () => void this.listeners.delete(cb) } } };
  }
}

class FunctionsApi {
  constructor(private client: ApiClient) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async invoke<T = any>(
    name: string,
    opts: { body?: unknown; headers?: Record<string, string>; method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' } = {},
  ): Promise<{ data: T | null; error: ApiError | null }> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      if (typeof opts.body === 'string' || opts.body instanceof Blob || opts.body instanceof ArrayBuffer || opts.body instanceof FormData) {
        body = opts.body as BodyInit;
      } else {
        body = JSON.stringify(opts.body);
        headers['Content-Type'] ??= 'application/json';
      }
    }
    try {
      const res = await this.client.request(`/functions/v1/${name}`, { method: opts.method ?? 'POST', headers, body });
      if (!res.ok) {
        const err = new ApiError(`Function ${name} returned HTTP ${res.status}`, res.status, { context: res });
        return { data: null, error: err };
      }
      const ct = res.headers.get('content-type') ?? '';
      const data = ct.includes('application/json') ? await res.json() : await res.text();
      return { data: data as T, error: null };
    } catch (e) {
      return { data: null, error: new ApiError((e as Error).message || 'network error', 0) };
    }
  }
}

export class ApiClient {
  readonly auth: AuthApi;
  readonly functions: FunctionsApi;
  private fetcher: typeof fetch;
  private globalHeaders: Record<string, string>;

  constructor(
    private baseUrl: string,
    private key: string,
    opts: ClientOptions = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetcher = opts.global?.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.globalHeaders = { ...(opts.global?.headers ?? {}) };
    const persist = opts.auth?.persistSession !== false && typeof window !== 'undefined';
    const storage = persist ? opts.auth?.storage ?? safeLocalStorage() ?? memoryStorage() : memoryStorage();
    this.auth = new AuthApi(this, storage, opts.auth?.storageKey ?? 'bsd-auth-session', opts.auth?.autoRefreshToken !== false);
    this.functions = new FunctionsApi(this);
  }

  /** Low-level request with the session (or the client key) as bearer token. */
  async request(path: string, init: RequestInit & { headers?: Record<string, string>; anonymous?: boolean } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...this.globalHeaders, ...(init.headers ?? {}) };
    if (this.key) headers.apikey ??= this.key;
    const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
    if (!hasAuth && !init.anonymous) {
      const token = (await this.auth.accessToken()) ?? (this.key || null);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const { anonymous: _a, ...rest } = init;
    return this.fetcher(`${this.baseUrl}${path}`, { ...rest, headers });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from<T = any>(table: string): QueryBuilder<T[]> {
    return new QueryBuilder<T[]>(this, `/rest/v1/${encodeURIComponent(table)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc<T = any>(fn: string, args: Record<string, unknown> = {}, opts: { head?: boolean; count?: CountOpt } = {}): QueryBuilder<T> {
    const b = new QueryBuilder<T>(this, `/rest/v1/rpc/${encodeURIComponent(fn)}`, opts.head ? 'HEAD' : 'POST', opts.head ? undefined : args);
    // rpc results are returned (unlike plain inserts)
    (b as unknown as { returning: boolean }).returning = true;
    if (opts.count) (b as unknown as { prefer: string[] }).prefer.push(`count=${opts.count}`);
    return b;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Drop-in for `createClient(url, key, options)`. */
export function createClient(url: string, key = '', opts: ClientOptions = {}): ApiClient {
  return new ApiClient(url, key, opts);
}

/** CORS headers for server functions (was @supabase/supabase-js/cors). */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-edge-secret',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export type Session = ApiSession;
export type User = ApiUser;
