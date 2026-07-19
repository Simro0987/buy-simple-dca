import { NextResponse } from "next/server";
import {
  fetchPricesMultiSource,
  toLegacyCryptoPrices,
} from "@/lib/price/multiSourceFetcher";
import { getCircuitSnapshot } from "@/lib/price/circuitBreaker";

export const revalidate = 60;

const CORE_TOKENS = [
  { symbol: "BTC", coingeckoId: "bitcoin", name: "Bitcoin" },
  { symbol: "ETH", coingeckoId: "ethereum", name: "Ethereum" },
  { symbol: "SOL", coingeckoId: "solana", name: "Solana" },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    const symbolsParam = searchParams.get("symbols");

    let tokens = [...CORE_TOKENS];

    if (idsParam) {
      const ids = idsParam.split(",").filter(Boolean);
      const symbols = symbolsParam?.split(",") ?? [];
      tokens = ids.map((id, index) => ({
        coingeckoId: id,
        symbol: symbols[index]?.toUpperCase() ?? id.slice(0, 4).toUpperCase(),
        name: symbols[index] ?? id,
      }));
    }

    const result = await fetchPricesMultiSource(tokens);

    return NextResponse.json({
      success: true,
      prices: result.prices,
      core: toLegacyCryptoPrices(result.prices),
      source: result.source,
      degraded: result.degraded,
      cached: result.cached,
      fetchedAt: result.fetchedAt,
      circuits: getCircuitSnapshot(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
