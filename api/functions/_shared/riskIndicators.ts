/**
 * Shared live market indicator engine for the Telegram Daily Risk Report.
 *
 * Everything here is derived from live Binance daily candles so the report
 * changes organically day-to-day (no static or repeating values).
 * Fallbacks keep the report renderable when an API call stutters.
 */

import { loadDailyCandles } from './candles.ts';



export const REPORT_TOKENS = [
  'BTC', 'ETH', 'SOL', 'HYPE', 'LINK', 'AAVE',
] as const;

export type ReportToken = typeof REPORT_TOKENS[number];

/** Binance spot pair per token. */
export const BINANCE_PAIR: Record<ReportToken, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  HYPE: 'HYPEUSDT',
  LINK: 'LINKUSDT',
  
  AAVE: 'AAVEUSDT',
};

/** CoinGecko fallback ids (used when Binance has no pair / stutters). */
export const COINGECKO_ID: Record<ReportToken, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid',
  LINK: 'chainlink',
  
  AAVE: 'aave',
};

export interface TokenIndicators {
  token: ReportToken;
  /** Live spot price (0 when fully unavailable). */
  price: number;
  /** Previous daily close — baseline for the 24H change. */
  prevClose: number;
  /** 24H change in percent. */
  change24hPct: number;
  /** Wilder RSI(14) on daily closes. */
  rsi14: number;
  /** 200D simple moving average (0 when history is too short). */
  sma200: number;
  /** Distance from SMA200 in percent. */
  smaDistPct: number;
  /** ATR(14) in absolute USD. */
  atr14: number;
  /** ATR(14) as percent of price — the volatility input of the risk score. */
  atrPct: number;
  /** ATR(14) of the previous 14 sessions — used to detect expansion. */
  atrPrevPct: number;
  /** True when the last close crossed above/below the SMA200 vs. the day before. */
  crossedSma: 'up' | 'down' | null;
  /** Where the numbers came from. */
  source: 'binance' | 'coingecko' | 'unavailable';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

/** Wilder-smoothed RSI over the given closes. */
export function rsiWilder(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 99;
  return clamp(100 - 100 / (1 + avgGain / avgLoss), 0, 100);
}

/** Average True Range over the trailing `period` sessions ending at `end`. */
export function atr(
  highs: number[], lows: number[], closes: number[], period = 14, end = closes.length,
): number {
  const start = end - period;
  if (start < 1) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    sum += tr;
  }
  return sum / period;
}

const EMPTY = (token: ReportToken): TokenIndicators => ({
  token,
  price: 0,
  prevClose: 0,
  change24hPct: 0,
  rsi14: 50,
  sma200: 0,
  smaDistPct: 0,
  atr14: 0,
  atrPct: 0,
  atrPrevPct: 0,
  crossedSma: null,
  source: 'unavailable',
});

/**
 * Loads live daily indicators for a single token.
 * The whole cascade (Binance hosts → CoinGecko candles → CoinGecko spot) is
 * awaited before anything is returned, so the report never renders on
 * half-resolved promises.
 */
export async function loadTokenIndicators(token: ReportToken): Promise<TokenIndicators> {
  const candles = await loadDailyCandles(BINANCE_PAIR[token], COINGECKO_ID[token], 365);
  const { closes, highs, lows } = candles;

  if (candles.source !== 'unavailable' && closes.length >= 30) {
    const price = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2] ?? price;
    const sma200 = closes.length >= 200
      ? closes.slice(-200).reduce((s, c) => s + c, 0) / 200
      : 0;
    const smaPrev = closes.length >= 201
      ? closes.slice(-201, -1).reduce((s, c) => s + c, 0) / 200
      : sma200;
    const a = atr(highs, lows, closes, 14);
    const aPrev = atr(highs, lows, closes, 14, closes.length - 14);
    let crossedSma: 'up' | 'down' | null = null;
    if (sma200 > 0 && smaPrev > 0) {
      if (prevClose <= smaPrev && price > sma200) crossedSma = 'up';
      else if (prevClose >= smaPrev && price < sma200) crossedSma = 'down';
    }
    return {
      token,
      price,
      prevClose,
      change24hPct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      rsi14: rsiWilder(closes),
      sma200,
      smaDistPct: sma200 > 0 ? ((price - sma200) / sma200) * 100 : 0,
      atr14: a,
      atrPct: price > 0 ? (a / price) * 100 : 0,
      atrPrevPct: price > 0 ? (aPrev / price) * 100 : 0,
      crossedSma,
      // Candle-derived indicators are live in both cases; keep the CoinGecko
      // marker so the report can note the fallback source.
      source: candles.source,
    };
  }

  // Last resort: CoinGecko spot + 24h change only.
  const cg = await fetchJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_ID[token]}&vs_currencies=usd&include_24hr_change=true`,
    12_000,
  );
  const entry = cg?.[COINGECKO_ID[token]];
  const price = Number(entry?.usd ?? 0);
  if (price > 0) {
    const change = Number(entry?.usd_24h_change ?? 0);
    return {
      ...EMPTY(token),
      price,
      prevClose: change !== 0 ? price / (1 + change / 100) : price,
      change24hPct: Number.isFinite(change) ? change : 0,
      source: 'coingecko',
    };
  }
  return EMPTY(token);
}

/**
 * Loads indicators for all report tokens. Runs in small sequential batches so
 * the CoinGecko fallback does not trip the free-tier rate limit, and awaits
 * every batch before returning a fully populated map.
 */
export async function loadAllIndicators(): Promise<Record<ReportToken, TokenIndicators>> {
  const map = {} as Record<ReportToken, TokenIndicators>;
  const BATCH = 3;
  for (let i = 0; i < REPORT_TOKENS.length; i += BATCH) {
    const batch = REPORT_TOKENS.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (t) => {
        try {
          return await loadTokenIndicators(t);
        } catch {
          return EMPTY(t);
        }
      }),
    );
    for (const r of results) map[r.token] = r;
  }
  return map;
}


export interface RiskScoreInput {
  /** Portfolio weight per token, 0..1 (must be normalised by the caller). */
  weights: Partial<Record<ReportToken, number>>;
  indicators: Record<ReportToken, TokenIndicators>;
  /** Fear & Greed index 0..100 (optional tilt). */
  fearGreed?: number;
}

export interface RiskScoreResult {
  /** Global LiveRiskScore in percent (0..100). */
  score: number;
  /** Weighted ATR% across the portfolio. */
  weightedAtrPct: number;
  /** Herfindahl concentration index 0..1 (1 = single asset). */
  concentration: number;
  /** Weighted RSI across the portfolio. */
  weightedRsi: number;
  /** Weight of the largest position, 0..1. */
  topWeight: number;
  topToken: ReportToken | null;
}

/**
 * Dynamic global risk index: volatility (ATR) × weight distribution,
 * with concentration and momentum tilts. Moves whenever the market moves.
 */
export function computeLiveRiskScore(input: RiskScoreInput): RiskScoreResult {
  let weightedAtrPct = 0;
  let weightedRsi = 0;
  let hhi = 0;
  let topWeight = 0;
  let topToken: ReportToken | null = null;
  let totalWeight = 0;

  for (const token of REPORT_TOKENS) {
    const w = Number(input.weights[token] ?? 0);
    if (!Number.isFinite(w) || w <= 0) continue;
    const ind = input.indicators[token];
    totalWeight += w;
    weightedAtrPct += w * (ind?.atrPct || 0);
    weightedRsi += w * (ind?.rsi14 ?? 50);
    hhi += w * w;
    if (w > topWeight) {
      topWeight = w;
      topToken = token;
    }
  }

  if (totalWeight <= 0) {
    return {
      score: 0, weightedAtrPct: 0, concentration: 0,
      weightedRsi: 50, topWeight: 0, topToken: null,
    };
  }

  weightedAtrPct /= totalWeight;
  weightedRsi /= totalWeight;
  hhi /= totalWeight * totalWeight;

  // Volatility component: 0% ATR → 0, 8% ATR → 100.
  const volComponent = clamp((weightedAtrPct / 8) * 100, 0, 100);
  // Concentration component: HHI 0.10 (diversified) → 0, 1.0 (single asset) → 100.
  const concComponent = clamp(((hhi - 0.1) / 0.9) * 100, 0, 100);
  // Momentum component: overbought books more downside risk than oversold.
  const rsiComponent = clamp(((weightedRsi - 30) / 50) * 100, 0, 100);
  const fgComponent = clamp(Number(input.fearGreed ?? 50), 0, 100);

  const score = clamp(
    volComponent * 0.45 + concComponent * 0.25 + rsiComponent * 0.2 + fgComponent * 0.1,
    0,
    100,
  );

  return { score, weightedAtrPct, concentration: hhi, weightedRsi, topWeight, topToken };
}
