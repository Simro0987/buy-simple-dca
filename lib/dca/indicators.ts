import { ATR, BollingerBands, EMA, RSI, SMA } from "technicalindicators";
import { last } from "@/lib/dca/math";
import type { OhlcvCandle, TokenIndicators } from "@/lib/dca/types";

function lastNumber(values: number[] | undefined, fallback: number): number {
  const value = last(values ?? []);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function computeTokenIndicators(
  candles: OhlcvCandle[],
  livePrice?: number,
): TokenIndicators | null {
  if (candles.length < 210) return null;

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const price = livePrice && livePrice > 0 ? livePrice : last(closes) ?? 0;
  if (price <= 0) return null;

  const sma200Series = SMA.calculate({ period: 200, values: closes });
  const ema200Series = EMA.calculate({ period: 200, values: closes });
  const ema50Series = EMA.calculate({ period: 50, values: closes });
  const rsiSeries = RSI.calculate({ period: 14, values: closes });
  const atrSeries = ATR.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  });

  const sma200 = lastNumber(sma200Series, 0);
  const ema200 = lastNumber(ema200Series, 0);
  const ema50 = lastNumber(ema50Series, 0);
  const rsi = lastNumber(rsiSeries, 50);
  const atr = lastNumber(atrSeries, 0);
  if (sma200 <= 0 || ema50 <= 0) return null;

  const window = candles.slice(-14);
  const high14 = Math.max(...window.map((candle) => candle.high));
  const low14 = Math.min(...window.map((candle) => candle.low));
  const pivot = (high14 + low14 + price) / 3;
  const r1 = 2 * pivot - low14;
  const s1 = 2 * pivot - high14;

  return {
    sma200,
    ema200,
    ema50,
    rsi,
    atr,
    high14,
    low14,
    s1,
    r1,
    sma200DevPct: ((price - sma200) / sma200) * 100,
    ema50DevPct: ((price - ema50) / ema50) * 100,
  };
}

export function computeWma(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < slice.length; index += 1) {
    const weight = index + 1;
    numerator += slice[index] * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

export function computeSma(values: number[], period: number): number {
  if (values.length < period) return 0;
  return lastNumber(SMA.calculate({ period, values }), 0);
}

export function computeEma(values: number[], period: number): number {
  if (values.length < period) return 0;
  return lastNumber(EMA.calculate({ period, values }), 0);
}

export function computeRsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 0;
  return lastNumber(RSI.calculate({ period, values }), 0);
}

export function computeBollingerBands(
  values: number[],
  period = 20,
  stdDev = 2,
): { middle: number; upper: number; lower: number } | null {
  if (values.length < period) return null;
  const series = BollingerBands.calculate({ period, stdDev, values });
  const lastBand = last(series);
  if (!lastBand || !Number.isFinite(lastBand.lower)) return null;
  return {
    middle: lastBand.middle,
    upper: lastBand.upper,
    lower: lastBand.lower,
  };
}

export function computeVolumeSma(volumes: number[], period = 20): number {
  if (volumes.length < period) return 0;
  return lastNumber(SMA.calculate({ period, values: volumes }), 0);
}
