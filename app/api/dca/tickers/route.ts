import { NextResponse } from "next/server";
import { fetchBinanceJson } from "@/lib/dca/binance";
import type { DcaSymbol } from "@/lib/dca/types";
import { DCA_TOKENS } from "@/lib/dca/universe";

const COINGECKO_IDS: Partial<Record<DcaSymbol, string>> = {
  HYPE: "hyperliquid",
};

async function fetchCoinGeckoTicker(id: string) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${id}`,
    { cache: "no-store" },
  );
  if (!response.ok) return null;
  const json = (await response.json()) as {
    current_price?: number;
    price_change_percentage_24h?: number;
  }[];
  const coin = json[0];
  if (!coin?.current_price) return null;
  return {
    price: coin.current_price,
    change24h: coin.price_change_percentage_24h ?? 0,
  };
}

export async function GET() {
  const entries = await Promise.all(
    DCA_TOKENS.map(async (token) => {
      try {
        const data = (await fetchBinanceJson(
          `/api/v3/ticker/24hr?symbol=${token.binance}`,
        )) as { lastPrice?: string; priceChangePercent?: string; msg?: string };
        const price = Number(data.lastPrice) || 0;
        if (price > 0) {
          return [
            token.symbol,
            { price, change24h: Number(data.priceChangePercent) || 0 },
          ] as const;
        }
      } catch {
        // fallback
      }

      const geckoId = COINGECKO_IDS[token.symbol];
      if (geckoId) {
        const ticker = await fetchCoinGeckoTicker(geckoId);
        if (ticker) return [token.symbol, ticker] as const;
      }
      return [token.symbol, null] as const;
    }),
  );

  const tickers = Object.fromEntries(
    entries.filter(([, value]) => value !== null),
  ) as Partial<Record<DcaSymbol, { price: number; change24h: number }>>;

  return NextResponse.json({ tickers });
}
