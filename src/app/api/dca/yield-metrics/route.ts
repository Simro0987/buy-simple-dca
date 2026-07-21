import { NextResponse } from "next/server";
import { fetchAllYieldTokenMetrics } from "@/lib/yieldTokenTechnicals";
import { fetchDefillamaApyMap } from "@/lib/yieldStakingFetch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [metrics, stakingApy] = await Promise.all([
      fetchAllYieldTokenMetrics(),
      fetchDefillamaApyMap(),
    ]);

    return NextResponse.json({
      success: true,
      metrics,
      stakingApy,
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
