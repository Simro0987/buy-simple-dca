import { NextResponse } from "next/server";
import { fetchLiveMarketRegimeFactors } from "@/lib/fetchMarketRegimeFactors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchLiveMarketRegimeFactors();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
