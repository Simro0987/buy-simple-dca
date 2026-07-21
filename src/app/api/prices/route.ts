import { NextResponse } from "next/server";
import {
  fetchMarketDataRace,
  parseMarketTokens,
  toLegacyCryptoPrices,
} from "@/lib/market-data/fetchMarketData";

/** @deprecated Use /api/market-data — kept for backward compatibility */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const symbols = searchParams.get("symbols");

  const tokens = parseMarketTokens(ids, symbols);
  const result = await fetchMarketDataRace(tokens);

  return NextResponse.json({
    success: true,
    prices: result.prices,
    core: toLegacyCryptoPrices(result.prices),
    source: result.source,
    degraded: result.degraded,
    cached: false,
    fetchedAt: result.fetchedAt,
  });
}
