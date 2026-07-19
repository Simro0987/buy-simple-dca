import type { NewsArticle } from "@/lib/newsEngine";

export interface PortfolioTokenRef {
  symbol: string;
  name: string;
  logoUrl: string;
  usdValue: number;
}

export interface SmartNewsArticle extends NewsArticle {
  matchedTokens: PortfolioTokenRef[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenAppearsInText(text: string, token: PortfolioTokenRef): boolean {
  const haystack = text.toLowerCase();
  const symbol = token.symbol.toLowerCase();
  const name = token.name.toLowerCase();

  const symbolMatch = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "i").test(
    haystack,
  );
  const nameMatch =
    name.length >= 3 &&
    new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(haystack);

  return symbolMatch || nameMatch;
}

export function getMatchedTokens(
  article: NewsArticle,
  portfolioTokens: PortfolioTokenRef[],
): PortfolioTokenRef[] {
  const detected = new Set(
    (article.tokens ?? []).map((token) => token.toUpperCase()),
  );

  const byDetected = portfolioTokens.filter((token) =>
    detected.has(token.symbol.toUpperCase()),
  );
  if (byDetected.length > 0) return byDetected;

  if (article.primaryToken) {
    const primary = portfolioTokens.find(
      (token) =>
        token.symbol.toUpperCase() ===
        article.primaryToken?.symbol.toUpperCase(),
    );
    if (primary) return [primary];
  }

  const text = `${article.title} ${article.summary}`;
  return portfolioTokens.filter((token) => tokenAppearsInText(text, token));
}

export function enrichArticleWithMatches(
  article: NewsArticle,
  portfolioTokens: PortfolioTokenRef[],
): SmartNewsArticle {
  return {
    ...article,
    matchedTokens: getMatchedTokens(article, portfolioTokens),
  };
}

export function filterArticlesForPortfolio(
  articles: NewsArticle[],
  portfolioTokens: PortfolioTokenRef[],
): SmartNewsArticle[] {
  return articles
    .map((article) => enrichArticleWithMatches(article, portfolioTokens))
    .filter((article) => article.matchedTokens.length > 0);
}

export function getTopHolding(
  portfolioTokens: PortfolioTokenRef[],
): PortfolioTokenRef | null {
  if (portfolioTokens.length === 0) return null;

  return [...portfolioTokens].sort((a, b) => b.usdValue - a.usdValue)[0];
}

function relevanceScore(
  article: SmartNewsArticle,
  topHolding: PortfolioTokenRef | null,
): number {
  let score = 0;

  if (article.isFlash) score += 50;
  if (article.impact === "high") score += 30;
  else if (article.impact === "medium") score += 15;

  const topSymbol = topHolding?.symbol.toUpperCase();
  const matchesTop = article.matchedTokens.some(
    (token) => token.symbol.toUpperCase() === topSymbol,
  );
  if (matchesTop) score += 200;

  score += article.matchedTokens.length * 25;

  const ageHours =
    (Date.now() - new Date(article.publishedAt).getTime()) / 3_600_000;
  score += Math.max(0, 48 - ageHours);

  return score;
}

export function selectHeroArticle(
  articles: SmartNewsArticle[],
  portfolioTokens: PortfolioTokenRef[],
): SmartNewsArticle | null {
  if (articles.length === 0) return null;

  const topHolding = getTopHolding(portfolioTokens);
  const ranked = [...articles].sort(
    (a, b) =>
      relevanceScore(b, topHolding) - relevanceScore(a, topHolding) ||
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return ranked[0];
}

export function buildSmartFeed(
  articles: NewsArticle[],
  portfolioTokens: PortfolioTokenRef[],
  mode: "portfolio" | "all",
): {
  hero: SmartNewsArticle | null;
  list: SmartNewsArticle[];
  filtered: SmartNewsArticle[];
} {
  const enriched = articles.map((article) =>
    enrichArticleWithMatches(article, portfolioTokens),
  );

  const filtered = enriched.filter((article) => article.matchedTokens.length > 0);
  const feed = mode === "portfolio" ? filtered : enriched;
  const hero = selectHeroArticle(enriched, portfolioTokens);
  const list = feed.filter((article) => article.id !== hero?.id);

  return { hero, list, filtered };
}
