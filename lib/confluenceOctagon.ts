import {
  clamp,
  computeAtr14Pct,
  computeRsi14,
  computeSma,
  lerpScore,
} from "@/lib/dcaTechnicalIndicators";

export interface ConfluenceMetric {
  subject: string;
  shortLabel: string;
  value: number;
  fullMark: number;
}

export interface OhlcVolumeBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenOctagonSnapshot {
  symbol: string;
  name: string;
  metrics: ConfluenceMetric[];
  accumulationScore: number;
  price: number;
  avgPrice7d: number;
  fetchedAt: string;
  live: boolean;
}

export interface OctagonTokenDefinition {
  symbol: string;
  name: string;
  binanceSymbol: string;
}

export const DEFAULT_OCTAGON_BASKET: OctagonTokenDefinition[] = [
  { symbol: "BTC", name: "Bitcoin", binanceSymbol: "BTCUSDT" },
  { symbol: "ETH", name: "Ethereum", binanceSymbol: "ETHUSDT" },
  { symbol: "SOL", name: "Solana", binanceSymbol: "SOLUSDT" },
  { symbol: "HYPE", name: "Hyperliquid", binanceSymbol: "HYPEUSDT" },
  { symbol: "JUP", name: "Jupiter", binanceSymbol: "JUPUSDT" },
];

/** @deprecated Use DEFAULT_OCTAGON_BASKET or resolveOctagonTokensFromPortfolio */
export const OCTAGON_TOKEN_DEFINITIONS = DEFAULT_OCTAGON_BASKET;

export type OctagonTokenSymbol = string;

function round0(value: number): number {
  return Math.round(value);
}

function computeWeeklyRsiScore(weeklyCloses: number[]): number {
  if (weeklyCloses.length < 16) return 50;
  const rsi = computeRsi14(weeklyCloses);
  return round0(lerpScore(rsi, 25, 70, 90, 25));
}

function computeMfi14(bars: OhlcVolumeBar[]): number {
  if (bars.length < 15) return 50;
  const typicalPrices = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
  let posFlow = 0;
  let negFlow = 0;
  for (let i = bars.length - 14; i < bars.length; i++) {
    const raw = typicalPrices[i] * bars[i].volume;
    if (typicalPrices[i] > typicalPrices[i - 1]) posFlow += raw;
    else negFlow += raw;
  }
  if (negFlow === 0) return 100;
  const mfi = 100 - 100 / (1 + posFlow / negFlow);
  return round0(lerpScore(mfi, 20, 80, 85, 30));
}

function computeBollingerScore(closes: number[]): number {
  if (closes.length < 20) return 50;
  const period = 20;
  const slice = closes.slice(-period);
  const sma = slice.reduce((sum, value) => sum + value, 0) / period;
  const variance =
    slice.reduce((sum, value) => sum + (value - sma) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  if (std <= 0) return 50;
  const price = closes[closes.length - 1];
  const lower = sma - 2 * std;
  const upper = sma + 2 * std;
  const position = clamp((price - lower) / (upper - lower), 0, 1);
  return round0(lerpScore(position, 0, 1, 95, 20));
}

function computeFearGreedScore(fearGreed: number): number {
  return round0(lerpScore(fearGreed, 10, 85, 95, 20));
}

function computeWma200Score(price: number, wma200: number): number {
  if (price <= 0 || wma200 <= 0) return 50;
  const distPct = ((price - wma200) / wma200) * 100;
  return round0(lerpScore(distPct, -25, 20, 95, 20));
}

function computeVolumeMomentumScore(bars: OhlcVolumeBar[]): number {
  const volumes = bars.map((bar) => bar.volume).filter((volume) => volume > 0);
  if (volumes.length < 30) return 50;
  const vol7 = volumes.slice(-7).reduce((sum, volume) => sum + volume, 0) / 7;
  const vol30 =
    volumes.slice(-30).reduce((sum, volume) => sum + volume, 0) / 30;
  const ratio = vol30 > 0 ? vol7 / vol30 : 1;
  return round0(lerpScore(ratio, 0.7, 1.5, 35, 85));
}

function computeMvrvProxyScore(price: number, ema200: number): number {
  if (price <= 0 || ema200 <= 0) return 50;
  const ratio = price / ema200;
  return round0(lerpScore(ratio, 0.75, 1.8, 95, 20));
}

function computeFundingProxyScore(closes: number[], rsi14: number): number {
  if (closes.length < 8) return 50;
  const price = closes[closes.length - 1];
  const price7d = closes[closes.length - 8];
  const change7dPct =
    price7d > 0 ? ((price - price7d) / price7d) * 100 : 0;
  const momentumScore = round0(lerpScore(change7dPct, -12, 12, 90, 25));
  const rsiScore = round0(lerpScore(rsi14, 25, 75, 90, 25));
  return round0(momentumScore * 0.55 + rsiScore * 0.45);
}

export function buildTokenOctagonSnapshot(input: {
  symbol: string;
  name: string;
  dailyBars: OhlcVolumeBar[];
  weeklyBars: OhlcVolumeBar[];
  fearGreed: number;
}): TokenOctagonSnapshot | null {
  const { dailyBars, weeklyBars } = input;
  if (dailyBars.length < 20) return null;

  const closes = dailyBars.map((bar) => bar.close);
  const price = closes[closes.length - 1];
  const weeklyCloses = weeklyBars.slice(0, -1).map((bar) => bar.close);
  const wma200 =
    weeklyCloses.length >= 200
      ? computeSma(weeklyCloses, 200)
      : computeSma(weeklyCloses, weeklyCloses.length);
  const ema200 = computeSma(closes, Math.min(200, closes.length));
  const rsi14 = computeRsi14(closes);
  const avgPrice7d =
    closes.length >= 7
      ? closes.slice(-7).reduce((sum, value) => sum + value, 0) / 7
      : price;

  const metrics: ConfluenceMetric[] = [
    {
      subject: "W-RSI",
      shortLabel: "W-RSI",
      value: computeWeeklyRsiScore(weeklyCloses),
      fullMark: 100,
    },
    {
      subject: "Macro MFI",
      shortLabel: "Macro",
      value: computeMfi14(dailyBars),
      fullMark: 100,
    },
    {
      subject: "Bollinger",
      shortLabel: "Bollinger",
      value: computeBollingerScore(closes),
      fullMark: 100,
    },
    {
      subject: "Fear/Greed",
      shortLabel: "F&G",
      value: computeFearGreedScore(input.fearGreed),
      fullMark: 100,
    },
    {
      subject: "200WMA",
      shortLabel: "200WMA",
      value: computeWma200Score(price, wma200),
      fullMark: 100,
    },
    {
      subject: "Vol. Mom.",
      shortLabel: "Vol. Mom.",
      value: computeVolumeMomentumScore(dailyBars),
      fullMark: 100,
    },
    {
      subject: "MVRV",
      shortLabel: "MVRV",
      value: computeMvrvProxyScore(price, ema200),
      fullMark: 100,
    },
    {
      subject: "Funding",
      shortLabel: "Funding",
      value: computeFundingProxyScore(closes, rsi14),
      fullMark: 100,
    },
  ];

  const accumulationScore = round0(
    metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length,
  );

  return {
    symbol: input.symbol,
    name: input.name,
    metrics,
    accumulationScore,
    price,
    avgPrice7d: Math.round(avgPrice7d * 100) / 100,
    fetchedAt: new Date().toISOString(),
    live: dailyBars.length >= 50,
  };
}

export function computeAccumulationScore(metrics: ConfluenceMetric[]): number {
  if (metrics.length === 0) return 0;
  return round0(
    metrics.reduce((sum, metric) => sum + metric.value, 0) / metrics.length,
  );
}
