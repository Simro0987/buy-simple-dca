import type { DcaSymbol, OhlcvCandle } from "@/lib/dca/types";
import { BINANCE_ALLOWED_PAIRS, TOKEN_BY_SYMBOL } from "@/lib/dca/universe";

export const BINANCE_REST_BASES = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
] as const;

export function parseKlines(payload: unknown): OhlcvCandle[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const candle: OhlcvCandle = {
        openTime: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      };
      if (
        !Number.isFinite(candle.openTime) ||
        !Number.isFinite(candle.close) ||
        candle.close <= 0
      ) {
        return null;
      }
      return candle;
    })
    .filter((candle): candle is OhlcvCandle => candle !== null);
}

export function candlesFromCloses(
  points: [number, number][],
): OhlcvCandle[] {
  return candlesFromMarketChart(points, []);
}

export function candlesFromMarketChart(
  prices: [number, number][],
  volumes: [number, number][] = [],
): OhlcvCandle[] {
  return prices
    .map(([openTime, close], index) => {
      const prev = prices[index - 1]?.[1] ?? close;
      const volume = volumes[index]?.[1] ?? 0;
      return {
        openTime,
        open: prev,
        high: Math.max(prev, close),
        low: Math.min(prev, close),
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      } satisfies OhlcvCandle;
    })
    .filter((candle) => candle.close > 0);
}

/** Binance 1W candles open Monday 00:00 UTC. Used for CoinGecko daily → weekly fallback. */
export function aggregateWeekly(daily: OhlcvCandle[]): OhlcvCandle[] {
  const weeks = new Map<number, OhlcvCandle>();
  for (const candle of daily) {
    const date = new Date(candle.openTime);
    const weekday = date.getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const monday = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + mondayOffset,
    );
    const existing = weeks.get(monday);
    if (!existing) {
      weeks.set(monday, { ...candle, openTime: monday });
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }
  return [...weeks.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, candle]) => candle);
}

export function binancePairFor(symbol: DcaSymbol): string {
  return TOKEN_BY_SYMBOL[symbol].binance;
}

export function assertAllowedPair(pair: string): string {
  const normalized = pair.toUpperCase();
  if (!BINANCE_ALLOWED_PAIRS.has(normalized)) {
    throw new Error(`Nepovolený Binance pár: ${pair}`);
  }
  return normalized;
}

export async function fetchBinanceJson(path: string): Promise<unknown> {
  let lastError: unknown;
  for (const base of BINANCE_REST_BASES) {
    try {
      const response = await fetch(`${base}${path}`, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`${base} ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Binance REST zlyhalo");
}

export const BINANCE_WS_URLS = [
  "wss://data-stream.binance.vision/stream",
  "wss://stream.binance.com:9443/stream",
];

export function buildTickerStreamUrl(pairs: string[], base = BINANCE_WS_URLS[0]): string {
  const streams = pairs
    .map((pair) => `${pair.toLowerCase()}@miniTicker`)
    .join("/");
  return `${base}?streams=${streams}`;
}
