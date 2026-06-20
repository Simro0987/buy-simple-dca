/**
 * useConfluenceMetrics — 100 % free-tier public APIs, no API key required
 *
 * Data sources (all free-tier / public, zero registration needed):
 *  • Binance Spot klines  → api.binance.com/api/v3/klines        (free, unlimited public)
 *  • Binance Futures rate → fapi.binance.com/fapi/v1/premiumIndex (free, unlimited public)
 *  • Fear & Greed Index   → api.alternative.me/fng               (free, no key)
 *
 * All 8 indicators are computed from raw weekly candle data on the frontend.
 * localStorage cache ensures the chart is visible instantly on cold start,
 * even before the network requests complete.
 */
import { useQuery } from '@tanstack/react-query';

export type OctToken    = 'BTC' | 'ETH' | 'SOL';
export type DataQuality = 'live' | 'partial' | 'disconnected';

export interface AxisPoint       { axis: string; value: number; live: boolean }
export interface OctTokenMetrics { axes: AxisPoint[]; color: string }

// ─── constants ──────────────────────────────────────────────────────────────

const COLORS: Record<OctToken, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
};

const SPOT_SYMBOLS: Record<OctToken, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT',
};

const FUTURES_SYMBOLS: Record<OctToken, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT',
};

const TOKENS: OctToken[] = ['BTC', 'ETH', 'SOL'];

const CACHE_KEY = 'confluence-octagon-cache-v1';
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 h — weekly candles are slow-moving

// Fallback shown when ALL APIs are unreachable and no local cache exists
const FALLBACK_METRICS: Record<OctToken, OctTokenMetrics> = {
  BTC: { color: COLORS.BTC, axes: [
    { axis: 'W-RSI',      value: 45, live: false },
    { axis: 'Macro MFI',  value: 42, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 48, live: false },
    { axis: 'Vol.Mom.',   value: 44, live: false },
    { axis: 'MVRV Prox',  value: 46, live: false },
    { axis: 'Funding',    value: 50, live: false },
  ]},
  ETH: { color: COLORS.ETH, axes: [
    { axis: 'W-RSI',      value: 55, live: false },
    { axis: 'Macro MFI',  value: 52, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 56, live: false },
    { axis: 'Vol.Mom.',   value: 58, live: false },
    { axis: 'MVRV Prox',  value: 54, live: false },
    { axis: 'Funding',    value: 50, live: false },
  ]},
  SOL: { color: COLORS.SOL, axes: [
    { axis: 'W-RSI',      value: 62, live: false },
    { axis: 'Macro MFI',  value: 58, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 60, live: false },
    { axis: 'Vol.Mom.',   value: 64, live: false },
    { axis: 'MVRV Prox',  value: 59, live: false },
    { axis: 'Funding',    value: 50, live: false },
  ]},
};

// ─── localStorage cache ─────────────────────────────────────────────────────

interface CacheEnvelope { ts: number; payload: OctagonPayload }

function readCache(): OctagonPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, payload } = JSON.parse(raw) as CacheEnvelope;
    if (Date.now() - ts > CACHE_TTL) return null;
    return payload;
  } catch { return null; }
}

function writeCache(payload: OctagonPayload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload }));
  } catch { /* quota exceeded — silently ignore */ }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

/** AbortController-based timeout — compatible with all modern browsers */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

async function fetchWeeklyKlines(symbol: string): Promise<BinanceKline[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1w&limit=210`;
  const res = await fetchWithTimeout(url, 12_000);
  if (!res.ok) throw new Error(`Binance klines ${symbol}: ${res.status}`);
  return res.json() as Promise<BinanceKline[]>;
}

async function fetchFearGreedValue(): Promise<number> {
  const res  = await fetchWithTimeout('https://api.alternative.me/fng/?limit=1', 8_000);
  if (!res.ok) throw new Error(`FNG: ${res.status}`);
  const json = await res.json() as { data: Array<{ value: string }> };
  const v    = parseInt(json.data?.[0]?.value ?? '50', 10);
  if (!Number.isFinite(v)) throw new Error('FNG: invalid response');
  return v;
}

async function fetchFundingRate(symbol: string): Promise<number> {
  const url  = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`;
  const res  = await fetchWithTimeout(url, 8_000);
  if (!res.ok) throw new Error(`Funding ${symbol}: ${res.status}`);
  const json = await res.json() as { lastFundingRate?: string };
  return parseFloat(json.lastFundingRate ?? '0') || 0;
}

// ─── technical indicators ───────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function computeRSI(closes: number[]): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 99;
  return clamp(100 - 100 / (1 + avgGain / avgLoss));
}

function computeMFI(
  highs: number[], lows: number[], closes: number[], vols: number[],
): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  const n = closes.length;
  const start = n - period - 1;
  let posFlow = 0, negFlow = 0;
  for (let i = start + 1; i <= start + period; i++) {
    const tp     = (highs[i]   + lows[i]   + closes[i])   / 3;
    const prevTp = (highs[i-1] + lows[i-1] + closes[i-1]) / 3;
    const mf = tp * vols[i];
    if (tp >= prevTp) posFlow += mf; else negFlow += mf;
  }
  if (negFlow === 0) return 99;
  return clamp(100 - 100 / (1 + posFlow / negFlow));
}

function computeBollinger(closes: number[]): number {
  const period = 20;
  if (closes.length < period) return 50;
  const slice  = closes.slice(-period);
  const sma    = slice.reduce((s, v) => s + v, 0) / period;
  const stdDev = Math.sqrt(slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period);
  if (stdDev === 0) return 50;
  const upper   = sma + 2 * stdDev;
  const lower   = sma - 2 * stdDev;
  const current = closes[closes.length - 1];
  return clamp(((current - lower) / (upper - lower)) * 100);
}

function computeWMA200(closes: number[]): number {
  const period  = Math.min(200, closes.length);
  if (period < 10) return 50;
  const sma200  = closes.slice(-period).reduce((s, v) => s + v, 0) / period;
  const current = closes[closes.length - 1];
  return clamp(50 + ((current - sma200) / sma200) * 100 * 0.55);
}

function computeMVRVProxy(closes: number[]): number {
  const period = Math.min(52, closes.length);
  if (period < 4) return 50;
  const sma52   = closes.slice(-period).reduce((s, v) => s + v, 0) / period;
  const current = closes[closes.length - 1];
  return clamp(((current / sma52 - 0.5) / 5) * 100);
}

function computeVolMomentum(vols: number[]): number {
  if (vols.length < 8) return 50;
  const recent = vols.slice(-4).reduce((s, v) => s + v, 0);
  const prev   = vols.slice(-8, -4).reduce((s, v) => s + v, 0);
  if (prev === 0) return 50;
  return clamp(50 + (recent / prev - 1) * 40);
}

function fundingToScore(rate: number): number {
  return clamp(50 + rate * 1200);
}

// ─── aggregate payload ───────────────────────────────────────────────────────

interface TokenPayload {
  rsi: number; mfi: number; bollinger: number; wma200: number;
  mvrv: number; volMom: number; funding: number;
  klinesLive: boolean; fundingLive: boolean;
}

interface OctagonPayload {
  fearGreed: number; fearGreedLive: boolean;
  tokens: Record<OctToken, TokenPayload>;
}

async function fetchOctagonData(): Promise<OctagonPayload> {
  // All 7 requests fire in parallel; individual failures never block others
  const [fgResult, ...rest] = await Promise.allSettled([
    fetchFearGreedValue(),
    ...TOKENS.flatMap(t => [
      fetchWeeklyKlines(SPOT_SYMBOLS[t]),
      fetchFundingRate(FUTURES_SYMBOLS[t]),
    ]),
  ]);

  const fearGreed     = fgResult.status === 'fulfilled' ? fgResult.value : 50;
  const fearGreedLive = fgResult.status === 'fulfilled';

  const tokens = {} as Record<OctToken, TokenPayload>;

  TOKENS.forEach((token, i) => {
    const klinesResult  = rest[i * 2];
    const fundingResult = rest[i * 2 + 1];

    const fundingLive = fundingResult.status === 'fulfilled';
    const funding     = fundingLive
      ? fundingToScore((fundingResult as PromiseFulfilledResult<number>).value)
      : 50;

    if (klinesResult.status === 'fulfilled') {
      const klines = (klinesResult as PromiseFulfilledResult<BinanceKline[]>).value;
      const closes = klines.map(k => parseFloat(k[4]));
      const highs  = klines.map(k => parseFloat(k[2]));
      const lows   = klines.map(k => parseFloat(k[3]));
      const vols   = klines.map(k => parseFloat(k[5]));

      tokens[token] = {
        rsi:       computeRSI(closes),
        mfi:       computeMFI(highs, lows, closes, vols),
        bollinger: computeBollinger(closes),
        wma200:    computeWMA200(closes),
        mvrv:      computeMVRVProxy(closes),
        volMom:    computeVolMomentum(vols),
        funding,
        klinesLive: true,
        fundingLive,
      };
    } else {
      tokens[token] = {
        rsi: 50, mfi: 50, bollinger: 50, wma200: 50, mvrv: 50, volMom: 50,
        funding,
        klinesLive: false,
        fundingLive,
      };
    }
  });

  const payload: OctagonPayload = { fearGreed, fearGreedLive, tokens };
  writeCache(payload); // persist for cold starts
  return payload;
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useConfluenceMetrics() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey:        ['confluence-octagon-v2'],
    queryFn:         fetchOctagonData,
    initialData:     () => readCache() ?? undefined,  // serve stale cache instantly
    staleTime:       30 * 60 * 1000,                  // 30 min
    refetchInterval: 60 * 60 * 1000,                  // refresh hourly
    retry:           2,
    retryDelay:      attempt => Math.min(2000 * 2 ** attempt, 15_000),
  });

  // ── metrics ────────────────────────────────────────────────────────────────
  let metrics: Record<OctToken, OctTokenMetrics>;

  if (!data) {
    metrics = FALLBACK_METRICS;
  } else {
    metrics = TOKENS.reduce((acc, sym) => {
      const t = data.tokens[sym];
      acc[sym] = {
        color: COLORS[sym],
        axes: [
          { axis: 'W-RSI',      value: t.rsi,          live: t.klinesLive  },
          { axis: 'Macro MFI',  value: t.mfi,          live: t.klinesLive  },
          { axis: 'Bollinger',  value: t.bollinger,    live: t.klinesLive  },
          { axis: 'Fear/Greed', value: data.fearGreed, live: data.fearGreedLive },
          { axis: '200WMA',     value: t.wma200,       live: t.klinesLive  },
          { axis: 'Vol.Mom.',   value: t.volMom,       live: t.klinesLive  },
          { axis: 'MVRV Prox',  value: t.mvrv,         live: t.klinesLive  },
          { axis: 'Funding',    value: t.funding,      live: t.fundingLive },
        ],
      };
      return acc;
    }, {} as Record<OctToken, OctTokenMetrics>);
  }

  // ── data quality ───────────────────────────────────────────────────────────
  let dataQuality: DataQuality;
  let liveCount = 0;

  if (!data && !!error) {
    dataQuality = 'disconnected';
  } else if (data) {
    const allLive = TOKENS.every(t => data.tokens[t].klinesLive);
    const anyLive = TOKENS.some(t => data.tokens[t].klinesLive);
    dataQuality = allLive && data.fearGreedLive ? 'live'
                : anyLive                       ? 'partial'
                                               : 'disconnected';
    liveCount   = metrics['BTC'].axes.filter(a => a.live).length;
  } else {
    dataQuality = 'partial';
  }

  return {
    metrics,
    isLoading,
    dataQuality,
    liveCount,
    refetch: () => { void refetch(); },
  };
}
