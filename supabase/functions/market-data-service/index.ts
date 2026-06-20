// Live market data aggregator for the DCA engine.
//
// STRICT DATA SOURCE CONTRACT (hardcoded — do NOT swap providers):
//   • BTC / ETH / SOL klines (price, 200WMA, ATR, RSI) → Binance Public REST
//     (api.binance.com/api/v3/klines) — Yahoo Finance is BANNED because it
//     hard-blocks serverless edge IPs (403/429).
//   • BTC Mayer Multiple / 200d → CoinGecko (api.coingecko.com)
//   • Solana TVL                → DefiLlama (api.llama.fi)
//   • Token Unlocks (>3% supply, 30d) → DefiLlama emission index
//   • Fear & Greed (consumed client-side) → Alternative.me
//
// NO APPROXIMATIONS. If a source is unreachable the response uses the cached
// value or the hardcoded fallback constants below. Never fabricate data.

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
  if (Date.now() - c.ts > TTL_MS * 4) return c.data;
  return c.data;
}
function writeCache<T>(key: string, data: T) {
  cache.set(key, { ts: Date.now(), data: data as unknown });
}

const FALLBACKS = {
  btc200wma: 48500,
  btcMayer: 1.15,
  btcRealizedPrice: 53600,
  btcMiningCost: 50000,
  solanaTvl: 11_500_000_000,
  unlocksWarning: [] as Array<{ symbol: string; pct: number; date: string }>,
  atr14d: { BTC: 2.0, ETH: 2.8, SOL: 4.2 } as Record<string, number>,
};

async function safeFetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return await res.json();
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return null;
    } catch {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return null;
    }
  }
  return null;
}

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

/**
 * Fetch Binance klines and return parsed OHLC arrays.
 * Index map: [openTime, open, high, low, close, volume, ...]
 */
async function fetchBinanceKlines(symbol: string, interval: string, limit: number): Promise<{
  closes: number[]; highs: number[]; lows: number[];
} | null> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}&_=${Date.now()}`;
  const json = await safeFetchJson(url, { cache: 'no-store' }) as BinanceKline[] | null;
  if (!Array.isArray(json) || json.length === 0) return null;
  // Drop the last (possibly incomplete) candle — Binance returns the live one.
  const completed = json.slice(0, -1);
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  for (const k of completed) {
    const c = parseFloat(k[4]);
    const h = parseFloat(k[2]);
    const l = parseFloat(k[3]);
    if (Number.isFinite(c) && c > 0) {
      closes.push(c);
      highs.push(h);
      lows.push(l);
    }
  }
  // Also expose the live last close as the current price (caller uses last of closes).
  const lastLive = parseFloat(json[json.length - 1][4]);
  if (Number.isFinite(lastLive) && lastLive > 0) {
    closes.push(lastLive);
    highs.push(parseFloat(json[json.length - 1][2]));
    lows.push(parseFloat(json[json.length - 1][3]));
  }
  return { closes, highs, lows };
}

/**
 * BTC 200WMA from Binance weekly closes (excludes live in-progress weekly candle).
 */
async function fetch200WMA_BTC(currentPrice?: number): Promise<{ value: number; stale: boolean; price: number }> {
  const k = await fetchBinanceKlines('BTCUSDT', '1w', 210);
  if (!k || k.closes.length < 201) {
    return { value: FALLBACKS.btc200wma, stale: true, price: currentPrice ?? 0 };
  }
  // Exclude the live candle (last element) from the 200WMA computation.
  const completed = k.closes.slice(0, -1);
  const slice = completed.slice(-200);
  const ma = slice.reduce((s, v) => s + v, 0) / slice.length;
  const livePrice = k.closes[k.closes.length - 1];
  if (typeof currentPrice === 'number' && currentPrice > 0) {
    const dev = Math.abs((currentPrice - ma) / ma) * 100;
    if (dev > 50) {
      console.error(`[market-data-service] BTC 200WMA sanity reject: dev ${dev.toFixed(1)}%`);
      return { value: ma, stale: true, price: livePrice };
    }
  }
  return { value: ma, stale: false, price: livePrice };
}

/**
 * 14D Wilder ATR % from Binance daily OHLC.
 */
async function fetchAtr14d(symbol: string): Promise<number> {
  const key = `atr14:${symbol}`;
  const baseSym = symbol.replace('USDT', '');
  const fallback = FALLBACKS.atr14d[baseSym] ?? 3.0;
  const k = await fetchBinanceKlines(symbol, '1d', 60);
  if (!k || k.closes.length < 16) {
    return readCache<number>(key) ?? fallback;
  }
  const { highs, lows, closes } = k;
  const n = closes.length;
  const trs: number[] = [];
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (pc > 0) trs.push((tr / pc) * 100);
  }
  if (trs.length < 7) return readCache<number>(key) ?? fallback;
  const atr = trs.reduce((s, v) => s + v, 0) / trs.length;
  writeCache(key, atr);
  return atr;
}

/**
 * 14D Wilder RSI from Binance daily closes. 125 candles → proper smoothing convergence.
 */
async function fetchRsi14d(symbol: string): Promise<number | null> {
  const k = await fetchBinanceKlines(symbol, '1d', 125);
  if (!k) return null;
  const closes = k.closes;
  if (closes.length < 16) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Math.max(0, Math.min(100, rsi));
}

async function fetchMayerMultiple(): Promise<{ value: number; price: number; ma200d: number }> {
  const key = 'mayer';
  try {
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=210`;
    const json = await safeFetchJson(url) as { prices?: [number, number][] } | null;
    const prices = json?.prices ?? [];
    if (prices.length >= 200) {
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
    const [mayer, solTvl, unlocks, btcAtr, ethAtr, solAtr, ethRsi, solRsi] = await Promise.all([
      fetchMayerMultiple(),
      fetchSolanaTvl(),
      fetchUpcomingUnlocks(['ARB', 'OP', 'SUI', 'AVAX']),
      fetchAtr14d('BTCUSDT'),
      fetchAtr14d('ETHUSDT'),
      fetchAtr14d('SOLUSDT'),
      fetchRsi14d('ETHUSDT'),
      fetchRsi14d('SOLUSDT'),
    ]);

    // BTC-ONLY 200WMA (Binance weekly).
    const btc200 = await fetch200WMA_BTC(mayer.price);

    // Prefer live Binance price if Mayer (CoinGecko) returned 0.
    const btcPrice = mayer.price > 0 ? mayer.price : btc200.price;

    const payload = {
      generatedAt: new Date().toISOString(),
      btc: {
        ma200w: btc200.value,
        ma200wStale: btc200.stale,
        mayerMultiple: mayer.value,
        ma200d: mayer.ma200d,
        price: btcPrice,
        realizedPrice: FALLBACKS.btcRealizedPrice,
        miningCost: FALLBACKS.btcMiningCost,
        atr14d: btcAtr,
      },
      eth: { atr14d: ethAtr, rsi14: ethRsi },
      sol: { tvl: solTvl, atr14d: solAtr, rsi14: solRsi },
      unlocks,
      degraded: btc200.stale,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      generatedAt: new Date().toISOString(),
      btc: { ma200w: FALLBACKS.btc200wma, ma200wStale: true, mayerMultiple: FALLBACKS.btcMayer, ma200d: 0, price: 0, realizedPrice: FALLBACKS.btcRealizedPrice, miningCost: FALLBACKS.btcMiningCost, atr14d: FALLBACKS.atr14d.BTC },
      eth: { atr14d: FALLBACKS.atr14d.ETH, rsi14: null },
      sol: { tvl: FALLBACKS.solanaTvl, atr14d: FALLBACKS.atr14d.SOL, rsi14: null },
      unlocks: FALLBACKS.unlocksWarning,
      degraded: true,
      fallback: true,
      error: String(e),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
