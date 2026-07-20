import { NextResponse } from "next/server";
import { fetchLiveDcaInputs } from "@/lib/fetchAndCalculateDCA";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { prices, fearGreed } = await fetchLiveDcaInputs();
    return NextResponse.json({
      success: true,
      prices,
      fearGreed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
