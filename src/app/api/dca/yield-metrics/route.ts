import { NextResponse } from "next/server";
import { fetchAllYieldTokenMetrics } from "@/lib/yieldTokenTechnicals";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics = await fetchAllYieldTokenMetrics();
    return NextResponse.json({
      success: true,
      metrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
