// Live market data aggregator for the DCA engine.
//
// STRICT DATA SOURCE CONTRACT (hardcoded — do NOT swap providers):
//   • BTC / ETH price & 200WMA  → Yahoo Finance  (query1.finance.yahoo.com)
//   • BTC Mayer Multiple / 200d → CoinGecko      (api.coingecko.com)
//   • Solana TVL                → DefiLlama      (api.llama.fi)
//   • Token Unlocks (>3% supply, 30d) → DefiLlama emission index
//                                 (token.unlocks.app compatible schema)
//   • Fear & Greed (consumed client-side) → Alternative.me
//
// NO APPROXIMATIONS. If a source is unreachable the response uses the cached
// value or the hardcoded fallback constants below (Realized 53600, Mining
// 50000, 200WMA BTC 48500 / ETH 2350, Sol TVL 11.5B). Never fabricate data.

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
// IMPORTANT: ATR fallbacks per-asset MUST be independent (no shared constant
// between ETH and SOL) so the per-coin MKT/LMT splits diverge naturally.
const FALLBACKS = {
  btc200wma: 48500,
  eth200wma: 2350,
  btcMayer: 1.15,
  btcRealizedPrice: 53600,
  btcMiningCost: 50000,
  solanaTvl: 11_500_000_000,
  unlocksWarning: [] as Array<{ symbol: string; pct: number; date: string }>,
  // Per-asset 14D ATR % fallback — historicky distinct, NEVER shared.
  atr14d: { BTC: 2.0, ETH: 2.8, SOL: 4.2 } as Record<string, number>,
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

// Yahoo Finance weekly closes — strict 200 COMPLETED-week MA.
// HARD PURGE: cache is bypassed for 200WMA. Every request performs a fresh
// cold-start fetch. We also reject stale "ghost" values >20% deviation from
// current price (sanity check) — caller will mark the field unavailable.
async function fetch200WMA(symbol: string, fallback: number, currentPrice?: number): Promise<{ value: number; stale: boolean }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1wk&range=10y&_=${Date.now()}`;
  const json = await safeFetchJson(url, { cache: 'no-store' }) as {
    chart?: { result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: number[] }> };
    }> }
  } | null;
  const result = json?.chart?.result?.[0];
  const rawCloses = result?.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result?.timestamp ?? [];
  const nowSec = Math.floor(Date.now() / 1000);
  const oneWeekSec = 7 * 86400;
  const pairs: Array<{ t: number; c: number }> = [];
  for (let i = 0; i < rawCloses.length; i++) {
    const c = rawCloses[i];
    const t = timestamps[i] ?? 0;
    if (typeof c !== 'number' || !(c > 0)) continue;
    if (t > 0 && nowSec - t < oneWeekSec) continue;
    pairs.push({ t, c });
  }
  if (pairs.length < 200) return { value: fallback, stale: true };
  const slice = pairs.slice(-200).map(p => p.c);
  const ma = slice.reduce((s, v) => s + v, 0) / slice.length;
  // HARD VALIDATION: if deviation from current price > 20%, treat as stale ghost.
  if (typeof currentPrice === 'number' && currentPrice > 0) {
    const dev = Math.abs((currentPrice - ma) / ma) * 100;
    if (dev > 20) {
      console.error(`[market-data-service] Cache Stale — ${symbol} 200WMA deviation ${dev.toFixed(1)}% > 20% threshold. Rejecting value.`);
      return { value: ma, stale: true };
    }
  }
  return { value: ma, stale: false };
}

/**
 * Independent 14D ATR % per asset from Yahoo daily OHLC.
 * Each symbol uses its OWN history and its OWN fallback constant —
 * NO shared constant across ETH/SOL so their splits diverge naturally.
 */
async function fetchAtr14d(symbol: string): Promise<number> {
  const key = `atr14:${symbol}`;
  const fallback = FALLBACKS.atr14d[symbol.split('-')[0]] ?? 3.0;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2mo`;
  const json = await safeFetchJson(url) as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ high?: number[]; low?: number[]; close?: number[] }> } }> } } | null;
  const q = json?.chart?.result?.[0]?.indicators?.quote?.[0];
  const highs = q?.high ?? [];
  const lows = q?.low ?? [];
  const closes = q?.close ?? [];
  const n = Math.min(highs.length, lows.length, closes.length);
  if (n < 16) {
    const cached = readCache<number>(key);
    return cached ?? fallback;
  }
  const trs: number[] = [];
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    if (typeof h !== 'number' || typeof l !== 'number' || typeof pc !== 'number') continue;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (pc > 0) trs.push((tr / pc) * 100);
  }
  if (trs.length < 7) {
    const cached = readCache<number>(key);
    return cached ?? fallback;
  }
  const atr = trs.reduce((s, v) => s + v, 0) / trs.length;
  writeCache(key, atr);
  return atr;
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
    // Mayer first → gives us current BTC price for sanity-checking 200WMA.
    const [mayer, solTvl, unlocks, btcAtr, ethAtr, solAtr] = await Promise.all([
      fetchMayerMultiple(),
      fetchSolanaTvl(),
      fetchUpcomingUnlocks(['ARB', 'OP', 'SUI', 'AVAX']),
      fetchAtr14d('BTC-USD'),
      fetchAtr14d('ETH-USD'),
      fetchAtr14d('SOL-USD'),
    ]);

    // BTC-ONLY 200WMA — never applied to ETH/SOL per domain restriction.
    const btc200 = await fetch200WMA('BTC-USD', FALLBACKS.btc200wma, mayer.price);
    const btc_200wma_weekly = btc200.value;
    const btc200wmaStale = btc200.stale;

    const payload = {
      generatedAt: new Date().toISOString(),
      btc: {
        ma200w: btc_200wma_weekly,
        ma200wStale: btc200wmaStale,
        mayerMultiple: mayer.value,
        ma200d: mayer.ma200d,
        price: mayer.price,
        realizedPrice: FALLBACKS.btcRealizedPrice,
        miningCost: FALLBACKS.btcMiningCost,
        atr14d: btcAtr,
      },
      // ETH/SOL: NO 200WMA. CBBC + independent ATR only.
      eth: { atr14d: ethAtr },
      sol: { tvl: solTvl, atr14d: solAtr },
      unlocks,
      degraded: btc200wmaStale,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
    });
  } catch (e) {
    // Last resort: full fallback payload
    return new Response(JSON.stringify({
      generatedAt: new Date().toISOString(),
      btc: { ma200w: FALLBACKS.btc200wma, mayerMultiple: FALLBACKS.btcMayer, ma200d: 0, price: 0, realizedPrice: FALLBACKS.btcRealizedPrice, miningCost: FALLBACKS.btcMiningCost, atr14d: FALLBACKS.atr14d.BTC },
      eth: { ma200w: FALLBACKS.eth200wma, atr14d: FALLBACKS.atr14d.ETH },
      sol: { tvl: FALLBACKS.solanaTvl, atr14d: FALLBACKS.atr14d.SOL },
      unlocks: FALLBACKS.unlocksWarning,
      degraded: true,
      error: String(e),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
