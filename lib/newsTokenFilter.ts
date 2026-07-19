import type { NewsArticle } from "@/lib/newsEngine";
import { isFlashAlertArticle } from "@/lib/newsFlashAlert";

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

function isGlobalMainTokenFlash(
  article: SmartNewsArticle,
  portfolioTokens: PortfolioTokenRef[],
  flashArticleId: string | null,
): boolean {
  if (!isFlashAlertArticle(article, flashArticleId)) return false;
  const mainToken = getTopHolding(portfolioTokens);
  if (!mainToken) return false;
  return articleMatchesToken(article, mainToken.symbol);
}

function applyTokenFilterWithFlash(
  feed: SmartNewsArticle[],
  enriched: SmartNewsArticle[],
  selectedToken: string,
  portfolioTokens: PortfolioTokenRef[],
  flashArticleId: string | null,
): SmartNewsArticle[] {
  const seen = new Set<string>();
  const result: SmartNewsArticle[] = [];

  const add = (article: SmartNewsArticle) => {
    if (!seen.has(article.id)) {
      seen.add(article.id);
      result.push(article);
    }
  };

  if (flashArticleId) {
    const flashArticle = enriched.find((article) => article.id === flashArticleId);
    if (flashArticle) {
      if (
        articleMatchesToken(flashArticle, selectedToken) ||
        isGlobalMainTokenFlash(flashArticle, portfolioTokens, flashArticleId)
      ) {
        add(flashArticle);
      }
    }
  }

  for (const article of feed) {
    if (articleMatchesToken(article, selectedToken)) {
      add(article);
    }
  }

  return result;
}

function splitFlashAndRegular(
  articles: SmartNewsArticle[],
  flashArticleId: string | null,
): {
  flashArticles: SmartNewsArticle[];
  regularArticles: SmartNewsArticle[];
} {
  const flashArticles: SmartNewsArticle[] = [];
  const regularArticles: SmartNewsArticle[] = [];

  for (const article of articles) {
    if (isFlashAlertArticle(article, flashArticleId)) {
      flashArticles.push(article);
    } else {
      regularArticles.push(article);
    }
  }

  const sortByScore = (a: SmartNewsArticle, b: SmartNewsArticle) =>
    (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);

  return {
    flashArticles: flashArticles.sort(sortByScore).slice(0, 1),
    regularArticles: regularArticles.sort(sortByScore),
  };
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
  heroArticleId?: string | null,
): SmartNewsArticle | null {
  if (articles.length === 0) return null;

  if (heroArticleId) {
    const serverHero = articles.find((article) => article.id === heroArticleId);
    if (serverHero) return serverHero;
  }

  const topHolding = getTopHolding(portfolioTokens);
  const ranked = [...articles].sort(
    (a, b) =>
      (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
      relevanceScore(b, topHolding) - relevanceScore(a, topHolding),
  );

  return ranked[0];
}

export function articleMatchesToken(
  article: SmartNewsArticle,
  symbol: string,
): boolean {
  const normalized = symbol.toUpperCase();
  return (
    article.matchedTokens.some(
      (token) => token.symbol.toUpperCase() === normalized,
    ) ||
    article.tokens.some((token) => token.toUpperCase() === normalized) ||
    article.primaryToken?.symbol.toUpperCase() === normalized
  );
}

export function buildSmartFeed(
  articles: NewsArticle[],
  portfolioTokens: PortfolioTokenRef[],
  mode: "portfolio" | "all",
  heroArticleId?: string | null,
  selectedToken?: string | null,
  flashArticleId?: string | null,
): {
  hero: SmartNewsArticle | null;
  list: SmartNewsArticle[];
  flashArticles: SmartNewsArticle[];
  regularArticles: SmartNewsArticle[];
  filtered: SmartNewsArticle[];
} {
  const enriched = articles.map((article) =>
    enrichArticleWithMatches(article, portfolioTokens),
  );

  const filtered = enriched.filter(
    (article) => article.matchedTokens.length > 0 || article.isMarketStatus,
  );
  let feed = mode === "portfolio" ? filtered : enriched;

  if (selectedToken) {
    feed = applyTokenFilterWithFlash(
      feed,
      enriched,
      selectedToken,
      portfolioTokens,
      flashArticleId ?? null,
    );
  }

  const heroPool = selectedToken ? feed : enriched;
  const hero = selectHeroArticle(heroPool, portfolioTokens, heroArticleId);
  const listWithoutHero = [...feed]
    .filter((article) => article.id !== hero?.id)
    .sort((a, b) => {
      const aFlash = isFlashAlertArticle(a, flashArticleId ?? null) ? 1 : 0;
      const bFlash = isFlashAlertArticle(b, flashArticleId ?? null) ? 1 : 0;
      if (aFlash !== bFlash) return bFlash - aFlash;
      return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    });

  const { flashArticles, regularArticles } = splitFlashAndRegular(
    listWithoutHero,
    flashArticleId ?? null,
  );

  return {
    hero,
    list: listWithoutHero,
    flashArticles,
    regularArticles,
    filtered,
  };
}
