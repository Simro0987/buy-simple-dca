// Read-only market/chain data proxy for the browser (public, no session needed).
// Why: several providers block browsers (CORS) or need a key that must never reach the browser.
//   GET  ?src=pyth&ids=<feedId>,<feedId>      -> Pyth Hermes latest prices
//   GET  ?src=funding&symbol=BTCUSDT          -> Binance USD-M premium index (funding rate)
//   GET  ?src=coinglass&symbol=BTC            -> Coinglass funding list (only with COINGLASS_API_KEY)
//   POST ?src=solana  {jsonrpc,method,params} -> Solana JSON-RPC, allow-listed read methods only
//                                               (SOLANA_RPC_URL, e.g. a Helius URL with key, else public RPCs)
// Responses are cached in memory for a short time to protect upstream rate limits.
import { corsHeaders } from '../_shared/apiClient.ts';

const SOLANA_READ_METHODS = new Set([
  'getHealth',
  'getSlot',
  'getEpochInfo',
  'getInflationRate',
  'getRecentPrioritizationFees',
  'getBalance',
  'getAccountInfo',
  'getMultipleAccounts',
  'getTokenAccountsByOwner',
  'getParsedTokenAccountsByOwner',
  'getTokenAccountBalance',
  'getTokenSupply',
  'getSupply',
]);
const PUBLIC_SOLANA_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];
const TTL_MS: Record<string, number> = { pyth: 10_000, funding: 60_000, coinglass: 300_000, solana: 20_000 };
const MAX_CACHE = 300;
const cache = new Map<string, { ts: number; status: number; body: string }>();

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });

async function cached(key: string, ttl: number, load: () => Promise<{ status: number; body: string }>): Promise<Response> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return json(hit.status, hit.body, { 'X-Cache': 'hit' });
  const r = await load();
  if (r.status === 200) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { ts: Date.now(), ...r });
  }
  return json(r.status, r.body, { 'X-Cache': 'miss' });
}

async function upstream(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{ status: number; body: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = await res.text();
    return { status: res.ok ? 200 : 502, body: res.ok ? body : JSON.stringify({ error: `upstream ${res.status}` }) };
  } catch (e) {
    return { status: 502, body: JSON.stringify({ error: `upstream unavailable: ${(e as Error).message}` }) };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const src = url.searchParams.get('src') ?? '';

  if (src === 'pyth' && req.method === 'GET') {
    const ids = (url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim().replace(/^0x/, '')).filter(Boolean);
    if (!ids.length || ids.length > 30 || !ids.every((i) => /^[0-9a-f]{64}$/i.test(i))) return json(400, { error: 'ids: 1-30 hex feed ids' });
    const qs = ids.map((i) => `ids[]=${i}`).join('&');
    return cached(`pyth:${ids.sort().join(',')}`, TTL_MS.pyth, () => upstream(`https://hermes.pyth.network/v2/updates/price/latest?${qs}&parsed=true`));
  }

  if (src === 'funding' && req.method === 'GET') {
    const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(symbol)) return json(400, { error: 'bad symbol' });
    return cached(`funding:${symbol}`, TTL_MS.funding, () => upstream(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`));
  }

  if (src === 'coinglass' && req.method === 'GET') {
    const key = Deno.env.get('COINGLASS_API_KEY');
    if (!key) return json(503, { error: 'COINGLASS_API_KEY is not configured on the server' });
    const symbol = (url.searchParams.get('symbol') ?? 'BTC').toUpperCase();
    if (!/^[A-Z0-9]{2,15}$/.test(symbol)) return json(400, { error: 'bad symbol' });
    return cached(`coinglass:${symbol}`, TTL_MS.coinglass, () =>
      upstream(`https://open-api-v3.coinglass.com/api/futures/fundingRate/exchange-list?symbol=${symbol}`, {
        headers: { 'CG-API-KEY': key, accept: 'application/json' },
      }),
    );
  }

  if (src === 'solana' && req.method === 'POST') {
    let rpc: { method?: string; params?: unknown };
    try {
      const text = await req.text();
      if (text.length > 4096) return json(413, { error: 'request too large' });
      rpc = JSON.parse(text);
    } catch {
      return json(400, { error: 'invalid JSON-RPC body' });
    }
    if (!rpc || typeof rpc.method !== 'string' || !SOLANA_READ_METHODS.has(rpc.method)) {
      return json(400, { error: 'method not allowed (read-only proxy)' });
    }
    const params = Array.isArray(rpc.params) ? rpc.params : [];
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: rpc.method, params });
    const configured = Deno.env.get('SOLANA_RPC_URL');
    const targets = configured ? [configured, ...PUBLIC_SOLANA_RPCS] : PUBLIC_SOLANA_RPCS;
    return cached(`solana:${body}`, TTL_MS.solana, async () => {
      let last = { status: 502, body: JSON.stringify({ error: 'no solana rpc reachable' }) };
      for (const t of targets) {
        last = await upstream(t, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, 6000);
        if (last.status === 200) return last;
      }
      return last;
    });
  }

  return json(400, { error: 'unknown src (pyth | funding | coinglass | solana)' });
});
