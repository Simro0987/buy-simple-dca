"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LiveAsset } from "@/hooks/usePortfolio";
import type { NewsArticle } from "@/lib/newsEngine";
import {
  buildSmartFeed,
  type PortfolioTokenRef,
  type SmartNewsArticle,
} from "@/lib/newsTokenFilter";

export type NewsFeedMode = "portfolio" | "all";

interface NewsFeedResponse {
  success: boolean;
  articles: NewsArticle[];
  heroImageUrl?: string;
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
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mode, setMode] = useState<NewsFeedMode>("portfolio");

  const portfolioTokens = useMemo(
    () => portfolioAssets.map(toPortfolioTokenRef),
    [portfolioAssets],
  );

  const symbolsParam = useMemo(
    () => portfolioTokens.map((token) => token.symbol).join(","),
    [portfolioTokens],
  );

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = symbolsParam
        ? `?symbols=${encodeURIComponent(symbolsParam)}`
        : "";
      const response = await fetch(`/api/news${query}`, { cache: "no-store" });
      const data = (await response.json()) as NewsFeedResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Nepodarilo sa načítať správy");
      }

      setArticles(data.articles ?? []);
      setHeroImageUrl(data.heroImageUrl);
      setLastUpdated(
        data.fetchedAt ? new Date(data.fetchedAt) : new Date(),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chyba pri načítaní správ",
      );
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [symbolsParam]);

  useEffect(() => {
    void loadNews();
    const interval = setInterval(() => {
      void loadNews();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNews]);

  const smartFeed = useMemo(
    () => buildSmartFeed(articles, portfolioTokens, mode),
    [articles, portfolioTokens, mode],
  );

  const resolveHeroImage = useCallback(
    async (hero: SmartNewsArticle | null) => {
      if (!hero) return undefined;
      if (hero.imageUrl) return hero.imageUrl;
      if (heroImageUrl && hero.id === smartFeed.hero?.id) return heroImageUrl;

      try {
        const response = await fetch("/api/news/hero-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: hero.title }),
        });
        const data = (await response.json()) as {
          success: boolean;
          imageUrl?: string;
        };
        return data.imageUrl;
      } catch {
        return undefined;
      }
    },
    [heroImageUrl, smartFeed.hero?.id],
  );

  const [resolvedHeroImage, setResolvedHeroImage] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const image = await resolveHeroImage(smartFeed.hero);
      if (!cancelled) setResolvedHeroImage(image);
    })();
    return () => {
      cancelled = true;
    };
  }, [smartFeed.hero, resolveHeroImage]);

  return {
    mode,
    setMode,
    articles,
    portfolioTokens,
    heroArticle: smartFeed.hero,
    listArticles: smartFeed.list,
    matchedCount: smartFeed.filtered.length,
    heroImageUrl: resolvedHeroImage ?? smartFeed.hero?.imageUrl,
    loading,
    error,
    lastUpdated,
    refresh: loadNews,
  };
}
