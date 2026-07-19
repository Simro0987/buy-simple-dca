import { NextResponse } from "next/server";
import { aggregateNews } from "@/lib/newsEngine";

export const revalidate = 900;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols =
      searchParams.get("symbols")?.split(",").filter(Boolean) ?? [];

    const articles = await aggregateNews(symbols);

    return NextResponse.json({
      success: true,
      articles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, articles: [] },
      { status: 500 },
    );
  }
}
