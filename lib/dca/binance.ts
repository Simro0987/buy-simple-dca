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
  return points
    .map(([openTime, close], index) => {
      const prev = points[index - 1]?.[1] ?? close;
      const high = Math.max(prev, close);
      const low = Math.min(prev, close);
      return {
        openTime,
        open: prev,
        high,
        low,
        close,
        volume: 0,
      } satisfies OhlcvCandle;
    })
    .filter((candle) => candle.close > 0);
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
