import { NextResponse } from "next/server";
import {
  executeBinanceOrders,
  fetchBinanceStablecoinBalance,
} from "@/lib/exchange/binanceServer";
import {
  assertLiveExchangeReady,
  getExchangeServerConfig,
} from "@/lib/exchange/serverConfig";
import type { ExchangeExecuteOrder } from "@/lib/exchange/types";

export const dynamic = "force-dynamic";

interface ExecuteBody {
  orders?: ExchangeExecuteOrder[];
}

export async function POST(request: Request) {
  try {
    const config = getExchangeServerConfig();
    assertLiveExchangeReady(config);

    const body = (await request.json()) as ExecuteBody;
    const orders = body.orders ?? [];

    if (orders.length === 0) {
      return NextResponse.json(
        { success: false, error: "No orders provided" },
        { status: 400 },
      );
    }

    const totalRequested = orders.reduce(
      (sum, order) => sum + order.amountUsd,
      0,
    );

    const { freeBalanceUsd } = await fetchBinanceStablecoinBalance(config);

    if (totalRequested > freeBalanceUsd + 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient balance. Required $${totalRequested.toFixed(2)}, available $${freeBalanceUsd.toFixed(2)}.`,
        },
        { status: 400 },
      );
    }

    const results = await executeBinanceOrders(config, orders);
    const failed = results.filter((item) => item.status === "failed");
    const totalExecutedUsd = results
      .filter((item) => item.status !== "failed")
      .reduce((sum, item) => sum + item.amountUsd, 0);

    if (failed.length === results.length) {
      return NextResponse.json(
        {
          success: false,
          mode: "live",
          results,
          error: failed[0]?.error ?? "All orders failed",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: failed.length === 0,
      mode: "live",
      results,
      totalExecutedUsd: Math.round(totalExecutedUsd * 100) / 100,
      error:
        failed.length > 0
          ? `${failed.length} order(s) failed — partial execution`
          : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Execution failed",
      },
      { status: 500 },
    );
  }
}
