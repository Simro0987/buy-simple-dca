import { NextResponse } from "next/server";
import { fetchBinanceStablecoinBalance } from "@/lib/exchange/binanceServer";
import { getExchangeServerConfig } from "@/lib/exchange/serverConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getExchangeServerConfig();

    if (!config.liveEnabled) {
      return NextResponse.json({
        success: false,
        liveEnabled: false,
        error:
          "Live exchange is not configured. Add BINANCE_API_KEY, BINANCE_API_SECRET, and EXCHANGE_LIVE_ENABLED=true to server env.",
      });
    }

    const { freeBalanceUsd, assets } = await fetchBinanceStablecoinBalance(config);

    return NextResponse.json({
      success: true,
      liveEnabled: true,
      exchange: config.provider,
      freeBalanceUsd: Math.round(freeBalanceUsd * 100) / 100,
      assets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Balance fetch failed",
      },
      { status: 500 },
    );
  }
}
