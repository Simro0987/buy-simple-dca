"use client";

import { useCallback, useEffect, useState } from "react";
import type { NewsArticle } from "@/lib/newsEngine";

interface NewsFeedResponse {
  success: boolean;
  articles: NewsArticle[];
  heroImageUrl?: string;
  error?: string;
  fetchedAt?: string;
}

export function useNewsFeed() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [heroImageUrl, setHeroImageUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/news", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    void loadNews();
    const interval = setInterval(() => {
      void loadNews();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadNews]);

  return {
    articles,
    heroArticle: articles[0] ?? null,
    listArticles: articles.slice(1),
    heroImageUrl,
    loading,
    error,
    lastUpdated,
    refresh: loadNews,
  };
}
