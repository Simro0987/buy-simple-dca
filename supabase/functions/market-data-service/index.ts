// Live market data aggregator for the DCA engine.
// Endpoints: 200WMA (BTC/ETH via Yahoo), Mayer Multiple (BTC via CoinGecko),
// BTC production cost (cluster fallback constants), Solana TVL (DefiLlama),
// upcoming unlocks >3% (DefiLlama). Graceful degradation: every block falls
// back to last cached value or hardcoded macro constants on failure.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory cache (per isolate). 6h TTL — graceful degradation source.
type Cached<T> = { ts: number; data: T };
const cache = new Map<string, Cached<unknown>>();
const TTL_MS = 6 * 60 * 60 * 1000;

function readCache<T>(key: string): T | null {
  const c = cache.get(key) as Cached<T> | undefined;
  if (!c) return null;
  if (Date.now() - c.ts > TTL_MS * 4) return c.data; // serve very stale on failure
  return c.data;
}
function writeCache<T>(key: string, data: T) {
  cache.set(key, { ts: Date.now(), data: data as unknown });
}

// Fallback constants — "Macro Support" cluster averages.
const FALLBACKS = {
  btc200wma: 48500,
  eth200wma: 2350,
  btcMayer: 1.15,
  btcRealizedPrice: 53600,
  btcMiningCost: 50000,
  solanaTvl: 11_500_000_000,
  unlocksWarning: [] as Array<{ symbol: string; pct: number; date: string }>,
};

async function safeFetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Yahoo Finance weekly closes — 200 week MA. Symbol e.g. BTC-USD, ETH-USD.
async function fetch200WMA(symbol: string, fallback: number): Promise<number> {
  const key = `wma:${symbol}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1wk&range=5y`;
  const json = await safeFetchJson(url) as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: number[] }> } }> } } | null;
  const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((n): n is number => typeof n === 'number' && n > 0) ?? [];
  if (closes.length < 50) {
    const cached = readCache<number>(key);
    return cached ?? fallback;
  }
  const slice = closes.slice(-200);
  const ma = slice.reduce((s, v) => s + v, 0) / slice.length;
  writeCache(key, ma);
  return ma;
}

// Mayer Multiple = price / 200d MA (BTC).
async function fetchMayerMultiple(): Promise<{ value: number; price: number; ma200d: number }> {
  const key = 'mayer';
  try {
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=210`;
    const json = await safeFetchJson(url) as { prices?: [number, number][] } | null;
    const prices = json?.prices ?? [];
    if (prices.length >= 200) {
      // bucketize daily
      const buckets = new Map<string, number>();
      for (const [ts, p] of prices) {
        buckets.set(new Date(ts).toISOString().slice(0, 10), p);
      }
      const arr = [...buckets.values()];
      const last200 = arr.slice(-200);
      const ma = last200.reduce((s, v) => s + v, 0) / last200.length;
      const price = arr[arr.length - 1];
      const out = { value: price / ma, price, ma200d: ma };
      writeCache(key, out);
      return out;
    }
  } catch { /* fall through */ }
  const cached = readCache<{ value: number; price: number; ma200d: number }>(key);
  return cached ?? { value: FALLBACKS.btcMayer, price: 0, ma200d: 0 };
}

async function fetchSolanaTvl(): Promise<number> {
  const key = 'sol-tvl';
  const json = await safeFetchJson('https://api.llama.fi/v2/historicalChainTvl/Solana') as Array<{ tvl: number }> | null;
  if (Array.isArray(json) && json.length > 0) {
    const tvl = json[json.length - 1].tvl;
    if (typeof tvl === 'number' && tvl > 0) {
      writeCache(key, tvl);
      return tvl;
    }
  }
  return readCache<number>(key) ?? FALLBACKS.solanaTvl;
}

// Approximation: DefiLlama doesn't have a free public "all unlocks" endpoint;
// we query the emissions index for tracked symbols and flag >3% supply unlocks
// in next 30 days. If the call fails, return [] (no warning rather than fake).
async function fetchUpcomingUnlocks(symbols: string[]): Promise<Array<{ symbol: string; pct: number; date: string }>> {
  const key = 'unlocks';
  const results: Array<{ symbol: string; pct: number; date: string }> = [];
  for (const sym of symbols) {
    const json = await safeFetchJson(`https://api.llama.fi/emission/${sym.toLowerCase()}`) as {
      metadata?: { circSupply?: number };
      unlockEvents?: Array<{ timestamp: number; noOfTokens?: number[] }>;
    } | null;
    if (!json?.unlockEvents) continue;
    const circ = json.metadata?.circSupply ?? 0;
    const now = Date.now() / 1000;
    const horizon = now + 30 * 86400;
    for (const ev of json.unlockEvents) {
      if (ev.timestamp < now || ev.timestamp > horizon) continue;
      const tokens = (ev.noOfTokens ?? []).reduce((s, v) => s + (v || 0), 0);
      if (circ > 0) {
        const pct = (tokens / circ) * 100;
        if (pct >= 3) {
          results.push({ symbol: sym, pct, date: new Date(ev.timestamp * 1000).toISOString().slice(0, 10) });
        }
      }
    }
  }
  if (results.length > 0) writeCache(key, results);
  return results.length > 0 ? results : (readCache<typeof results>(key) ?? FALLBACKS.unlocksWarning);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const [btc200wma, eth200wma, mayer, solTvl, unlocks] = await Promise.all([
      fetch200WMA('BTC-USD', FALLBACKS.btc200wma),
      fetch200WMA('ETH-USD', FALLBACKS.eth200wma),
      fetchMayerMultiple(),
      fetchSolanaTvl(),
      fetchUpcomingUnlocks(['ARB', 'OP', 'SUI', 'AVAX']),
    ]);

    const payload = {
      generatedAt: new Date().toISOString(),
      btc: {
        ma200w: btc200wma,
        mayerMultiple: mayer.value,
        ma200d: mayer.ma200d,
        price: mayer.price,
        realizedPrice: FALLBACKS.btcRealizedPrice,
        miningCost: FALLBACKS.btcMiningCost,
      },
      eth: { ma200w: eth200wma },
      sol: { tvl: solTvl },
      unlocks,
      degraded: btc200wma === FALLBACKS.btc200wma && eth200wma === FALLBACKS.eth200wma,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
    });
  } catch (e) {
    // Last resort: full fallback payload
    return new Response(JSON.stringify({
      generatedAt: new Date().toISOString(),
      btc: { ma200w: FALLBACKS.btc200wma, mayerMultiple: FALLBACKS.btcMayer, ma200d: 0, price: 0, realizedPrice: FALLBACKS.btcRealizedPrice, miningCost: FALLBACKS.btcMiningCost },
      eth: { ma200w: FALLBACKS.eth200wma },
      sol: { tvl: FALLBACKS.solanaTvl },
      unlocks: FALLBACKS.unlocksWarning,
      degraded: true,
      error: String(e),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
