/**
 * Shared daily-candle loader with a real fallback cascade.
 *
 * Binance is frequently unreachable (451 / restricted region) from the edge
 * runtime, which used to leave the Daily Risk Report with dummy values
 * (RSI 50, SMA n/a, ATR 0). This module retries Binance and then falls back to
 * CoinGecko market_chart daily prices so RSI/SMA/ATR are always live numbers.
 *
 * Every call is fully awaited by the caller before the report is rendered.
 */

export interface DailyCandles {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  source: 'binance' | 'coingecko' | 'unavailable';
}

export const EMPTY_CANDLES: DailyCandles = {
  closes: [], highs: [], lows: [], volumes: [], source: 'unavailable',
};

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Kline = [number, string, string, string, string, string, ...unknown[]];

const BINANCE_HOSTS = [
  'https://api.binance.com',
  'https://data-api.binance.vision',
  'https://api1.binance.com',
];

/** Binance daily klines with host rotation + one retry round. */
async function loadFromBinance(pair: string, limit: number): Promise<DailyCandles | null> {
  for (let round = 0; round < 2; round++) {
    for (const host of BINANCE_HOSTS) {
      const rows = await fetchJson<Kline[]>(
        `${host}/api/v3/klines?symbol=${pair}&interval=1d&limit=${limit}`,
        12_000,
      );
      if (Array.isArray(rows) && rows.length >= 30) {
        const closes = rows.map((r) => Number(r[4]));
        if (closes.filter((c) => Number.isFinite(c) && c > 0).length >= 30) {
          return {
            closes,
            highs: rows.map((r) => Number(r[2])),
            lows: rows.map((r) => Number(r[3])),
            volumes: rows.map((r) => Number(r[5])),
            source: 'binance',
          };
        }
      }
    }
    if (round === 0) await sleep(400);
  }
  return null;
}

/**
 * CoinGecko daily closes. market_chart returns closes only, so highs/lows are
 * reconstructed from the close series (true range then behaves as
 * close-to-close range — a conservative but live ATR).
 */
async function loadFromCoinGecko(id: string, days: number): Promise<DailyCandles | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await fetchJson<{ prices?: Array<[number, number]>; total_volumes?: Array<[number, number]> }>(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
      15_000,
    );
    const prices = (data?.prices ?? []).map((p) => Number(p[1])).filter((n) => Number.isFinite(n) && n > 0);
    if (prices.length >= 30) {
      const volumes = (data?.total_volumes ?? []).map((v) => Number(v[1]));
      const highs = prices.map((c, i) => Math.max(c, i > 0 ? prices[i - 1] : c));
      const lows = prices.map((c, i) => Math.min(c, i > 0 ? prices[i - 1] : c));
      return {
        closes: prices,
        highs,
        lows,
        volumes: volumes.length === prices.length ? volumes : prices.map(() => 0),
        source: 'coingecko',
      };
    }
    if (attempt === 0) await sleep(800);
  }
  return null;
}

/**
 * Loads daily candles for one asset, awaiting the whole cascade:
 * Binance (3 hosts × 2 rounds) → CoinGecko market_chart → unavailable.
 */
export async function loadDailyCandles(
  binancePair: string,
  coingeckoId: string,
  limit = 365,
): Promise<DailyCandles> {
  const binance = await loadFromBinance(binancePair, limit);
  if (binance) return binance;
  const cg = await loadFromCoinGecko(coingeckoId, limit);
  if (cg) return cg;
  return { ...EMPTY_CANDLES };
}
