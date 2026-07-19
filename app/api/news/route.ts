import { NextResponse } from "next/server";
import { aggregateNews, type PortfolioTokenInput } from "@/lib/newsEngine";

export const revalidate = 900;

function parsePortfolioTokens(searchParams: URLSearchParams): PortfolioTokenInput[] {
  const tokensParam = searchParams.get("tokens");
  if (tokensParam) {
    try {
      const parsed = JSON.parse(tokensParam) as PortfolioTokenInput[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((token) => token?.symbol)
          .map((token) => ({
            symbol: String(token.symbol).toUpperCase(),
            name: String(token.name || token.symbol),
            logoUrl: token.logoUrl,
            coingeckoId: token.coingeckoId,
          }));
      }
    } catch {
      // Fall through to symbols param
    }
  }

  const symbols =
    searchParams.get("symbols")?.split(",").filter(Boolean) ?? [];

  return symbols.map((symbol) => ({
    symbol: symbol.toUpperCase(),
    name: symbol,
  }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioTokens = parsePortfolioTokens(searchParams);
    const { articles, heroArticleId, flashArticleId } =
      await aggregateNews(portfolioTokens);

    return NextResponse.json({
      success: true,
      articles,
      heroArticleId,
      flashArticleId,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, articles: [], heroArticleId: null, flashArticleId: null },
      { status: 500 },
    );
  }
}
