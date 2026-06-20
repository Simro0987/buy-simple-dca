/**
 * useConfluenceMetrics — 100 % free public APIs only
 *
 * Data sources:
 *  • Weekly klines  → Binance Spot  (no API key)
 *  • Funding rates  → Binance Futures premiumIndex (no API key)
 *  • Fear & Greed   → alternative.me/fng  (no API key)
 *
 * All 8 indicators are computed on-the-fly from raw candle data.
 */
import { useQuery } from '@tanstack/react-query';

export type OctToken     = 'BTC' | 'ETH' | 'SOL';
export type DataQuality  = 'live' | 'partial' | 'disconnected';

export interface AxisPoint      { axis: string; value: number; live: boolean }
export interface OctTokenMetrics { axes: AxisPoint[]; color: string }

// ─── constants ─────────────────────────────────────────────────────────────

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

// Neutral baseline rendered when ALL APIs fail
const FALLBACK_METRICS: Record<OctToken, OctTokenMetrics> = {
  BTC: { color: COLORS.BTC, axes: [
    { axis: 'W-RSI',      value: 45, live: false },
    { axis: 'Macro MFI',  value: 42, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 48, live: false },
    { axis: 'Vol.Mom.',   value: 44, live: false },
    { axis: 'MVRV Prox', value: 46, live: false },
    { axis: 'Funding',   value: 50, live: false },
  ]},
  ETH: { color: COLORS.ETH, axes: [
    { axis: 'W-RSI',      value: 55, live: false },
    { axis: 'Macro MFI',  value: 52, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 56, live: false },
    { axis: 'Vol.Mom.',   value: 58, live: false },
    { axis: 'MVRV Prox', value: 54, live: false },
    { axis: 'Funding',   value: 50, live: false },
  ]},
  SOL: { color: COLORS.SOL, axes: [
    { axis: 'W-RSI',      value: 62, live: false },
    { axis: 'Macro MFI',  value: 58, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 60, live: false },
    { axis: 'Vol.Mom.',   value: 64, live: false },
    { axis: 'MVRV Prox', value: 59, live: false },
    { axis: 'Funding',   value: 50, live: false },
  ]},
};

// ─── math helpers ──────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Weekly RSI(14) */
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

/** Weekly MFI(14) — Money Flow Index using H/L/C/V */
function computeMFI(
  highs: number[], lows: number[], closes: number[], vols: number[],
): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  const n     = closes.length;
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

/** Bollinger Band position (20w): 0 = at lower band, 100 = at upper band */
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

/** 200-week MA distance → 0-100 */
function computeWMA200(closes: number[]): number {
  const period = Math.min(200, closes.length);
  if (period < 10) return 50;
  const slice   = closes.slice(-period);
  const sma200  = slice.reduce((s, v) => s + v, 0) / period;
  const current = closes[closes.length - 1];
  const distPct = ((current - sma200) / sma200) * 100;
  return clamp(50 + distPct * 0.55);
}

/**
 * MVRV proxy: current price / 52-week SMA ("realized price" substitute)
 * MVRV < 1 → cheap (score 0-20)  |  MVRV 1-2 → accumulate (20-55)
 * MVRV 2-3.5 → caution (55-80)  |  MVRV > 3.5 → euphoria (80-100)
 */
function computeMVRVProxy(closes: number[]): number {
  const period = Math.min(52, closes.length);
  if (period < 4) return 50;
  const sma52   = closes.slice(-period).reduce((s, v) => s + v, 0) / period;
  const current = closes[closes.length - 1];
  const mvrv    = current / sma52;
  return clamp(((mvrv - 0.5) / 5) * 100);
}

/**
 * Volume Momentum: recent 4w volume sum vs previous 4w
 * Declining vol in downtrend → low score (DCA zone)
 * Surging vol in uptrend → high score (momentum / caution)
 */
function computeVolMomentum(vols: number[]): number {
  if (vols.length < 8) return 50;
  const recent = vols.slice(-4).reduce((s, v) => s + v, 0);
  const prev   = vols.slice(-8, -4).reduce((s, v) => s + v, 0);
  if (prev === 0) return 50;
  return clamp(50 + (recent / prev - 1) * 40);
}

/** Funding rate % (8h) → 0-100  negative = cheap / bullish */
function fundingToScore(rate: number): number {
  return clamp(50 + rate * 1200);
}

// ─── Binance / alternative.me fetch helpers ────────────────────────────────

// Raw Binance kline row: [openTime, open, high, low, close, volume, ...]
type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

async function fetchWeeklyKlines(symbol: string): Promise<BinanceKline[]> {
  const url =
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1w&limit=210`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Binance klines ${symbol}: ${res.status}`);
  return res.json() as Promise<BinanceKline[]>;
}

async function fetchFearGreedValue(): Promise<number> {
  const res  = await fetch('https://api.alternative.me/fng/?limit=1', {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`FNG: ${res.status}`);
  const json = await res.json() as { data: Array<{ value: string }> };
  return parseInt(json.data[0].value, 10);
}

async function fetchFundingRate(symbol: string): Promise<number> {
  const url =
    `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Funding ${symbol}: ${res.status}`);
  const json = await res.json() as { lastFundingRate: string };
  return parseFloat(json.lastFundingRate ?? '0');
}

// ─── aggregate payload ─────────────────────────────────────────────────────

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
  // Fire all requests in parallel; never let one failure block others
  const [fgResult, ...rest] = await Promise.allSettled([
    fetchFearGreedValue(),
    ...TOKENS.flatMap(t => [
      fetchWeeklyKlines(SPOT_SYMBOLS[t]),
      fetchFundingRate(FUTURES_SYMBOLS[t]),
    ]),
  ]);

  const fearGreed     = fgResult.status === 'fulfilled' ? fgResult.value : 50;
  const fearGreedLive = fgResult.status === 'fulfilled';

  const tokenPayloads = {} as Record<OctToken, TokenPayload>;

  TOKENS.forEach((token, i) => {
    const klinesResult  = rest[i * 2];
    const fundingResult = rest[i * 2 + 1];

    const fundingLive = fundingResult.status === 'fulfilled';
    const funding     = fundingLive
      ? fundingToScore((fundingResult as PromiseFulfilledResult<number>).value)
      : 50;

    if (klinesResult.status === 'fulfilled') {
      const klines  = (klinesResult as PromiseFulfilledResult<BinanceKline[]>).value;
      const closes  = klines.map(k => parseFloat(k[4]));
      const highs   = klines.map(k => parseFloat(k[2]));
      const lows    = klines.map(k => parseFloat(k[3]));
      const vols    = klines.map(k => parseFloat(k[5]));

      tokenPayloads[token] = {
        rsi:      computeRSI(closes),
        mfi:      computeMFI(highs, lows, closes, vols),
        bollinger: computeBollinger(closes),
        wma200:   computeWMA200(closes),
        mvrv:     computeMVRVProxy(closes),
        volMom:   computeVolMomentum(vols),
        funding,
        klinesLive: true,
        fundingLive,
      };
    } else {
      tokenPayloads[token] = {
        rsi: 50, mfi: 50, bollinger: 50, wma200: 50, mvrv: 50, volMom: 50,
        funding,
        klinesLive: false,
        fundingLive,
      };
    }
  });

  return { fearGreed, fearGreedLive, tokens: tokenPayloads };
}

// ─── hook ──────────────────────────────────────────────────────────────────

export function useConfluenceMetrics() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['confluence-octagon-v2'],
    queryFn: fetchOctagonData,
    staleTime:       30 * 60 * 1000,   // 30 min — weekly candles don't move fast
    refetchInterval: 60 * 60 * 1000,   // refresh hourly
    retry: 2,
    retryDelay: attempt => Math.min(2000 * 2 ** attempt, 15_000),
  });

  // ── build metrics ────────────────────────────────────────────────────────
  let metrics: Record<OctToken, OctTokenMetrics>;

  if (!data) {
    metrics = FALLBACK_METRICS;
  } else {
    metrics = TOKENS.reduce((acc, sym) => {
      const t = data.tokens[sym];
      acc[sym] = {
        color: COLORS[sym],
        axes: [
          { axis: 'W-RSI',      value: t.rsi,       live: t.klinesLive },
          { axis: 'Macro MFI',  value: t.mfi,       live: t.klinesLive },
          { axis: 'Bollinger',  value: t.bollinger, live: t.klinesLive },
          { axis: 'Fear/Greed', value: data.fearGreed, live: data.fearGreedLive },
          { axis: '200WMA',     value: t.wma200,    live: t.klinesLive },
          { axis: 'Vol.Mom.',   value: t.volMom,    live: t.klinesLive },
          { axis: 'MVRV Prox', value: t.mvrv,      live: t.klinesLive },
          { axis: 'Funding',   value: t.funding,   live: t.fundingLive },
        ],
      };
      return acc;
    }, {} as Record<OctToken, OctTokenMetrics>);
  }

  // ── data quality ─────────────────────────────────────────────────────────
  let dataQuality: DataQuality;
  let liveCount = 0;

  if (!data && !!error) {
    dataQuality = 'disconnected';
  } else if (data) {
    const allKlinesLive = TOKENS.every(t => data.tokens[t].klinesLive);
    const anyKlinesLive = TOKENS.some(t => data.tokens[t].klinesLive);
    if (allKlinesLive && data.fearGreedLive) {
      dataQuality = 'live';
    } else if (anyKlinesLive) {
      dataQuality = 'partial';
    } else {
      dataQuality = 'disconnected';
    }
    // Count live axes for the first token (representative)
    liveCount = metrics['BTC'].axes.filter(a => a.live).length;
  } else {
    dataQuality = 'partial'; // loading with stale cache
    liveCount   = 0;
  }

  return {
    metrics,
    isLoading,
    dataQuality,
    liveCount,
    refetch: () => { void refetch(); },
  };
}
