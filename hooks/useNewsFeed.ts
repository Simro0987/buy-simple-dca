"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LiveAsset } from "@/hooks/usePortfolio";
import type { NewsArticle } from "@/lib/newsEngine";
import {
  buildSmartFeed,
  type PortfolioTokenRef,
} from "@/lib/newsTokenFilter";

export type NewsFeedMode = "portfolio" | "all";

interface NewsFeedResponse {
  success: boolean;
  articles: NewsArticle[];
  heroArticleId?: string | null;
  error?: string;
  fetchedAt?: string;
}

function toPortfolioTokenRef(asset: LiveAsset): PortfolioTokenRef {
  return {
    symbol: asset.symbol,
    name: asset.name,
    logoUrl: asset.logoUrl,
    usdValue: asset.usdValue,
  };
}

export function useNewsFeed(portfolioAssets: LiveAsset[] = []) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [heroArticleId, setHeroArticleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mode, setMode] = useState<NewsFeedMode>("portfolio");

  const portfolioTokens = useMemo(
    () => portfolioAssets.map(toPortfolioTokenRef),
    [portfolioAssets],
  );

  const tokensParam = useMemo(
    () =>
      JSON.stringify(
        portfolioTokens.map((token) => ({
          symbol: token.symbol,
          name: token.name,
          logoUrl: token.logoUrl,
        })),
      ),
    [portfolioTokens],
  );

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = portfolioTokens.length
        ? `?tokens=${encodeURIComponent(tokensParam)}`
        : "";
      const response = await fetch(`/api/news${query}`, { cache: "no-store" });
      const data = (await response.json()) as NewsFeedResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Nepodarilo sa načítať správy");
      }

      setArticles(data.articles ?? []);
      setHeroArticleId(data.heroArticleId ?? null);
      setLastUpdated(
        data.fetchedAt ? new Date(data.fetchedAt) : new Date(),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chyba pri načítaní správ",
      );
      setArticles([]);
      setHeroArticleId(null);
    } finally {
      setLoading(false);
    }
  }, [portfolioTokens.length, tokensParam]);

  useEffect(() => {
    void loadNews();
    const interval = setInterval(() => {
      void loadNews();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNews]);

  const smartFeed = useMemo(
    () => buildSmartFeed(articles, portfolioTokens, mode, heroArticleId),
    [articles, portfolioTokens, mode, heroArticleId],
  );

  return {
    mode,
    setMode,
    articles,
    portfolioTokens,
    heroArticle: smartFeed.hero,
    listArticles: smartFeed.list,
    matchedCount: smartFeed.filtered.length,
    heroImageUrl: smartFeed.hero?.imageUrl,
    loading,
    error,
    lastUpdated,
    refresh: loadNews,
  };
}
