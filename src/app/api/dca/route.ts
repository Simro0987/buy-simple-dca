import { NextResponse } from "next/server";
import { fetchDcaMarketSnapshot } from "@/lib/dcaMarketData";

export const revalidate = 300;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");
    const portfolioSymbols = symbolsParam
      ? symbolsParam.split(",").filter(Boolean)
      : undefined;

    const snapshot = await fetchDcaMarketSnapshot(portfolioSymbols);

    return NextResponse.json({
      success: true,
      snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
