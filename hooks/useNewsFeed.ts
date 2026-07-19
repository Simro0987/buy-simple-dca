"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { LiveAsset } from "@/hooks/usePortfolio";
import type { NewsArticle } from "@/lib/newsEngine";
import {
  buildSmartFeed,
  type PortfolioTokenRef,
} from "@/lib/newsTokenFilter";
import { useAppStore } from "@/src/store/useAppStore";

interface NewsFeedResponse {
  success: boolean;
  articles: NewsArticle[];
  heroArticleId?: string | null;
  flashArticleId?: string | null;
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

export type NewsFeedMode = "portfolio" | "all";

export function useNewsFeed(portfolioAssets: LiveAsset[] = []) {
  const newsFeed = useAppStore((state) => state.newsFeed);
  const setNewsMode = useAppStore((state) => state.setNewsMode);
  const setSelectedToken = useAppStore((state) => state.setSelectedToken);
  const setNewsArticles = useAppStore((state) => state.setNewsArticles);
  const setNewsLoading = useAppStore((state) => state.setNewsLoading);
  const setNewsError = useAppStore((state) => state.setNewsError);
  const setApiStatus = useAppStore((state) => state.setApiStatus);

  const portfolioTokens = useMemo(
    () => portfolioAssets.map(toPortfolioTokenRef),
    [portfolioAssets],
  );

  const tokensParam = useMemo(
    () =>
      JSON.stringify(
        portfolioAssets.map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          logoUrl: asset.logoUrl,
          coingeckoId: asset.coingeckoId,
        })),
      ),
    [portfolioAssets],
  );

  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError(null);

    try {
      const query = portfolioTokens.length
        ? `?tokens=${encodeURIComponent(tokensParam)}`
        : "";
      const response = await fetch(`/api/news${query}`, { cache: "no-store" });
      const data = (await response.json()) as NewsFeedResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Nepodarilo sa načítať správy");
      }

      setNewsArticles({
        articles: data.articles ?? [],
        heroArticleId: data.heroArticleId ?? null,
        flashArticleId: data.flashArticleId ?? null,
        fetchedAt: data.fetchedAt,
      });
      setApiStatus("news", {
        source: "aggregated",
        healthy: true,
        degraded: false,
        message: null,
        lastCheck: data.fetchedAt ?? new Date().toISOString(),
      });
    } catch (err) {
      setNewsError(
        err instanceof Error ? err.message : "Chyba pri načítaní správ",
      );
      setNewsArticles({
        articles: [],
        heroArticleId: null,
        flashArticleId: null,
      });
      setApiStatus("news", {
        source: "aggregated",
        healthy: false,
        degraded: true,
        message:
          err instanceof Error ? err.message : "Chyba pri načítaní správ",
        lastCheck: new Date().toISOString(),
      });
    }
  }, [
    portfolioTokens.length,
    tokensParam,
    setNewsArticles,
    setNewsError,
    setNewsLoading,
    setApiStatus,
  ]);

  useEffect(() => {
    void loadNews();
    const interval = setInterval(() => {
      void loadNews();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNews]);

  const smartFeed = useMemo(
    () =>
      buildSmartFeed(
        newsFeed.articles,
        portfolioTokens,
        newsFeed.mode,
        newsFeed.heroArticleId,
        newsFeed.selectedToken,
        newsFeed.flashArticleId,
      ),
    [
      newsFeed.articles,
      newsFeed.mode,
      newsFeed.heroArticleId,
      newsFeed.selectedToken,
      newsFeed.flashArticleId,
      portfolioTokens,
    ],
  );

  const lastUpdated = newsFeed.lastUpdated
    ? new Date(newsFeed.lastUpdated)
    : null;

  return {
    mode: newsFeed.mode,
    setMode: setNewsMode,
    selectedToken: newsFeed.selectedToken,
    setSelectedToken,
    articles: newsFeed.articles,
    portfolioTokens,
    flashArticleId: newsFeed.flashArticleId,
    heroArticle: smartFeed.hero,
    listArticles: smartFeed.list,
    flashArticles: smartFeed.flashArticles,
    regularArticles: smartFeed.regularArticles,
    matchedCount: smartFeed.filtered.length,
    heroImageUrl: smartFeed.hero?.imageUrl,
    loading: newsFeed.loading,
    error: newsFeed.error,
    lastUpdated,
    refresh: loadNews,
  };
}
