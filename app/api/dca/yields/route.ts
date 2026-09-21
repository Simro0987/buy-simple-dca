import { NextResponse } from "next/server";
import { pickYields } from "@/lib/dca/defillama";

export async function GET() {
  try {
    const response = await fetch("https://yields.llama.fi/pools", {
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ yields: {} }, { status: 200 });
    }
    const json = (await response.json()) as { data?: unknown };
    const pools = Array.isArray(json.data) ? json.data : [];
    const yields = pickYields(pools as Parameters<typeof pickYields>[0]);
    return NextResponse.json({ yields });
  } catch {
    return NextResponse.json({ yields: {} }, { status: 200 });
  }
}
