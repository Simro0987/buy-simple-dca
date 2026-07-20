import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import {
  fetchMarketDataRace,
  parseMarketTokens,
  searchCoinsServer,
  toLegacyCryptoPrices,
} from "@/lib/market-data/fetchMarketData";

export const revalidate = 60;

function getCachedMarketData(cacheKey: string, ids: string, symbols: string) {
  return unstable_cache(
    async () => {
      const tokens = parseMarketTokens(ids, symbols);
      return fetchMarketDataRace(tokens);
    },
    ["market-data", cacheKey],
    { revalidate: 60, tags: ["market-data"] },
  )();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "search") {
      const query = searchParams.get("query") ?? "";
      const coins = await searchCoinsServer(query);
      return NextResponse.json({
        success: true,
        coins,
        fetchedAt: new Date().toISOString(),
      });
    }

    const ids = searchParams.get("ids") ?? "bitcoin,ethereum,solana";
    const symbols = searchParams.get("symbols") ?? "BTC,ETH,SOL";
    const cacheKey = `${ids}|${symbols}`;

    const result = await getCachedMarketData(cacheKey, ids, symbols);

    return NextResponse.json({
      success: true,
      prices: result.prices,
      core: toLegacyCryptoPrices(result.prices),
      source: result.source,
      degraded: result.degraded,
      cached: true,
      fetchedAt: result.fetchedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, degraded: true },
      { status: 500 },
    );
  }
}
