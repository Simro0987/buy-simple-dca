import { NextResponse } from "next/server";
import { candlesFromCloses, fetchBinanceJson, parseKlines } from "@/lib/dca/binance";
import type { DcaSymbol, OhlcvCandle } from "@/lib/dca/types";
import { DCA_TOKENS } from "@/lib/dca/universe";

const COINGECKO_IDS: Partial<Record<DcaSymbol, string>> = {
  HYPE: "hyperliquid",
};

async function fetchCoinGeckoCandles(id: string): Promise<OhlcvCandle[]> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=250&interval=daily`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const json = (await response.json()) as { prices?: [number, number][] };
  return candlesFromCloses(json.prices ?? []);
}

export async function GET() {
  const entries = await Promise.all(
    DCA_TOKENS.map(async (token) => {
      try {
        const json = await fetchBinanceJson(
          `/api/v3/klines?symbol=${token.binance}&interval=1d&limit=250`,
        );
        const candles = parseKlines(json);
        if (candles.length > 0) return [token.symbol, candles] as const;
      } catch {
        // try coingecko fallback below
      }

      const geckoId = COINGECKO_IDS[token.symbol];
      if (geckoId) {
        try {
          return [token.symbol, await fetchCoinGeckoCandles(geckoId)] as const;
        } catch {
          return [token.symbol, []] as const;
        }
      }
      return [token.symbol, []] as const;
    }),
  );

  const klines = Object.fromEntries(entries) as Record<DcaSymbol, OhlcvCandle[]>;
  return NextResponse.json({ klines });
}
