import { NextResponse } from "next/server";
import {
  aggregateWeekly,
  candlesFromMarketChart,
  fetchBinanceJson,
  parseKlines,
} from "@/lib/dca/binance";
import type { DcaSymbol, OhlcvCandle } from "@/lib/dca/types";
import { DCA_TOKENS } from "@/lib/dca/universe";

const COINGECKO_IDS: Partial<Record<DcaSymbol, string>> = {
  HYPE: "hyperliquid",
};

const WEEKLY_SYMBOLS = new Set<DcaSymbol>([
  "BTC",
  "ETH",
  "SOL",
  "LINK",
  "AAVE",
  "UNI",
  "HYPE",
  "ZEC",
  "INJ",
]);

async function fetchCoinGeckoCandles(
  id: string,
  days: number,
): Promise<OhlcvCandle[]> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const json = (await response.json()) as {
    prices?: [number, number][];
    total_volumes?: [number, number][];
  };
  return candlesFromMarketChart(json.prices ?? [], json.total_volumes ?? []);
}

async function fetchBinanceCandles(
  pair: string,
  interval: "1d" | "1w",
  limit: number,
): Promise<OhlcvCandle[]> {
  const json = await fetchBinanceJson(
    `/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
  );
  return parseKlines(json);
}

export async function GET() {
  const geckoInflight = new Map<string, Promise<OhlcvCandle[]>>();
  const geckoDaily = (id: string) => {
    const cached = geckoInflight.get(id);
    if (cached) return cached;
    const request = fetchCoinGeckoCandles(id, 365).then(async (candles) => {
      if (candles.length > 0) return candles;
      return fetchCoinGeckoCandles(id, 250);
    });
    geckoInflight.set(id, request);
    return request;
  };

  const entries = await Promise.all(
    DCA_TOKENS.map(async (token) => {
      let daily: OhlcvCandle[] = [];
      let weekly: OhlcvCandle[] = [];
      const needsWeekly = WEEKLY_SYMBOLS.has(token.symbol);

      try {
        daily = await fetchBinanceCandles(token.binance, "1d", 250);
      } catch {
        daily = [];
      }

      if (needsWeekly) {
        try {
          weekly = await fetchBinanceCandles(token.binance, "1w", 200);
        } catch {
          weekly = [];
        }
      }

      const geckoId = COINGECKO_IDS[token.symbol];
      if (geckoId && (daily.length === 0 || (needsWeekly && weekly.length === 0))) {
        try {
          const gecko = await geckoDaily(geckoId);
          if (daily.length === 0) daily = gecko.slice(-250);
          if (needsWeekly && weekly.length === 0) {
            weekly = aggregateWeekly(gecko).slice(-200);
          }
        } catch {
          // keep whatever Binance already returned
        }
      }

      return [token.symbol, { daily, weekly }] as const;
    }),
  );

  const klines = Object.fromEntries(
    entries.map(([symbol, value]) => [symbol, value.daily]),
  ) as Record<DcaSymbol, OhlcvCandle[]>;
  const weeklyKlines = Object.fromEntries(
    entries.map(([symbol, value]) => [symbol, value.weekly]),
  ) as Record<DcaSymbol, OhlcvCandle[]>;

  return NextResponse.json({ klines, weeklyKlines });
}
