import { getSourceTrustScore } from "@/lib/newsDeduplication";
import type { PortfolioTokenInput, RawNewsItem } from "@/lib/newsEngine";

const FALLBACK_MARKET_CAP_RANK: Record<string, number> = {
  BTC: 1,
  ETH: 2,
  USDT: 3,
  BNB: 4,
  SOL: 5,
  XRP: 6,
  USDC: 7,
  ADA: 8,
  DOGE: 9,
  TRX: 10,
  LINK: 12,
  AVAX: 13,
  MATIC: 14,
  DOT: 15,
  UNI: 16,
  AAVE: 20,
  PENDLE: 45,
  GMX: 55,
  JUP: 60,
  MORPHO: 80,
  HYPE: 90,
};

export async function fetchMarketCapRanks(
  portfolioTokens: PortfolioTokenInput[],
): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();

  for (const token of portfolioTokens) {
    const symbol = token.symbol.toUpperCase();
    ranks.set(symbol, FALLBACK_MARKET_CAP_RANK[symbol] ?? 200);
  }

  const symbols = portfolioTokens.map((token) => token.symbol.toLowerCase()).join(",");
  if (!symbols) return ranks;

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${symbols}&per_page=250`,
      { next: { revalidate: 3600 } },
    );

    if (!response.ok) return ranks;

    const data = (await response.json()) as Array<{
      symbol: string;
      market_cap_rank?: number;
    }>;

    for (const coin of data) {
      if (coin.market_cap_rank) {
        ranks.set(coin.symbol.toUpperCase(), coin.market_cap_rank);
      }
    }
  } catch {
    // Keep fallback ranks
  }

  return ranks;
}

export function getTopMarketCapToken(
  portfolioTokens: PortfolioTokenInput[],
  marketCapRanks: Map<string, number>,
): PortfolioTokenInput | null {
  if (portfolioTokens.length === 0) return null;

  return [...portfolioTokens].sort((a, b) => {
    const rankA = marketCapRanks.get(a.symbol.toUpperCase()) ?? 999;
    const rankB = marketCapRanks.get(b.symbol.toUpperCase()) ?? 999;
    return rankA - rankB;
  })[0];
}

export function computeRelevanceScore(
  item: RawNewsItem,
  portfolioTokens: PortfolioTokenInput[],
  marketCapRanks: Map<string, number>,
): number {
  if (item.id.startsWith("market-status-")) {
    return 55;
  }

  const allowed = new Set(
    portfolioTokens.map((token) => token.symbol.toUpperCase()),
  );
  const matched = item.tokens.filter((token) =>
    allowed.has(token.toUpperCase()),
  );

  let score = 0;

  for (const token of matched) {
    const rank = marketCapRanks.get(token.toUpperCase()) ?? 150;
    score += Math.max(0, 220 - rank);
  }

  const ageHours =
    (Date.now() - new Date(item.publishedAt).getTime()) / 3_600_000;
  score += Math.max(0, 72 - ageHours) * 2.5;

  score += getSourceTrustScore(item) * 0.6;

  if (item.imageUrl && !item.imageUrl.startsWith("data:")) {
    score += 40;
  }

  if (matched.length === 0 && portfolioTokens.length > 0) {
    score *= 0.35;
  }

  return Math.round(score);
}

export function rankArticles(
  items: RawNewsItem[],
  portfolioTokens: PortfolioTokenInput[],
  marketCapRanks: Map<string, number>,
): Array<RawNewsItem & { relevanceScore: number }> {
  return items
    .map((item) => ({
      ...item,
      relevanceScore: computeRelevanceScore(item, portfolioTokens, marketCapRanks),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function selectHeroCandidate<
  T extends { tokens: string[]; relevanceScore?: number; imageUrl?: string },
>(
  articles: T[],
  portfolioTokens: PortfolioTokenInput[],
  marketCapRanks: Map<string, number>,
): T | null {
  if (articles.length === 0) return null;

  const topMarketCapToken = getTopMarketCapToken(portfolioTokens, marketCapRanks);
  const topSymbol = topMarketCapToken?.symbol.toUpperCase();

  const hasRealImage = (article: T) =>
    Boolean(article.imageUrl && !article.imageUrl.startsWith("data:"));

  const matchesTopCap = (article: T) =>
    topSymbol
      ? article.tokens.some((token) => token.toUpperCase() === topSymbol)
      : true;

  const topCapWithImage = articles.filter(
    (article) => matchesTopCap(article) && hasRealImage(article),
  );
  const topCapAny = articles.filter(matchesTopCap);
  const withImage = articles.filter(hasRealImage);

  const pool =
    topCapWithImage.length > 0
      ? topCapWithImage
      : topCapAny.length > 0
        ? topCapAny
        : withImage.length > 0
          ? withImage
          : articles;

  return [...pool].sort((a, b) => {
    const scoreA = a.relevanceScore ?? 0;
    const scoreB = b.relevanceScore ?? 0;
    return scoreB - scoreA;
  })[0];
}
