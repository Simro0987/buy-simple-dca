/**
 * Runs the original Supabase Edge Functions (supabase/functions/<name>/index.ts, Deno) inside
 * this Node process. They only use `Deno.env.get` and `Deno.serve`, plus `fetch`/Request/Response,
 * which Node 22 provides natively. `@supabase/supabase-js` imports are aliased to the npm package
 * at build time and talk to this API's own PostgREST + auth endpoints.
 */
export type FnHandler = (req: Request) => Response | Promise<Response>;

const registry = new Map<string, FnHandler>();
let registering: string | null = null;
let denoEnv: Record<string, string> = {};

export function installDenoShim(env: Record<string, string>): void {
  denoEnv = env;
  const shim = {
    env: {
      get: (k: string): string | undefined => denoEnv[k],
      toObject: () => ({ ...denoEnv }),
    },
    serve: (a: unknown, b?: unknown) => {
      const handler = (typeof a === 'function' ? a : b) as FnHandler | undefined;
      if (!registering) throw new Error('Deno.serve called outside of function registration');
      if (typeof handler !== 'function') throw new Error(`function ${registering}: Deno.serve without handler`);
      registry.set(registering, handler);
      return { finished: Promise.resolve(), shutdown: async () => {}, ref() {}, unref() {} };
    },
  };
  (globalThis as unknown as { Deno: typeof shim }).Deno = shim;
}

/** Imports one function module; its top-level `Deno.serve(handler)` registers the handler. */
export async function registerFunction(name: string, load: () => Promise<unknown>): Promise<void> {
  registering = name;
  try {
    await load();
  } finally {
    registering = null;
  }
  if (!registry.has(name)) throw new Error(`function ${name} did not call Deno.serve`);
}

export function getFunction(name: string): FnHandler | undefined {
  return registry.get(name);
}

export function functionNames(): string[] {
  return [...registry.keys()].sort();
}

/**
 * Functions callable without a session: the ones Supabase exposed with verify_jwt = false
 * (supabase/config.toml) plus two read-only market-data functions the UI calls before login
 * (on Supabase they only needed the public anon key, i.e. were effectively public too).
 * All others need a user session, the service key (function -> function) or the internal
 * edge secret (scheduler) - stricter than Supabase, where the public anon key was enough.
 */
export const PUBLIC_FUNCTIONS = new Set([
  'wallet-balance-btc',
  'wallet-balance-eth',
  'wallet-balance-sol',
  'coingecko-proxy',
  'gas-prices',
  'market-proxy',
  'token-tokenomics',
  'btc-indicators',
  'market-data-service',
  'mstr-mnav',
]);

export async function invokeFunction(name: string, req: Request, timeoutMs = 60_000): Promise<Response> {
  const fn = registry.get(name);
  if (!fn) return new Response(JSON.stringify({ error: `function ${name} not found` }), { status: 404 });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<Response>((resolve) => {
    timer = setTimeout(
      () => resolve(new Response(JSON.stringify({ error: 'function timeout' }), { status: 504 })),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([Promise.resolve().then(() => fn(req)), timeout]);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message ?? 'function error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}
