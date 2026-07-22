"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { DcaMarketSnapshot } from "@/lib/dcaMarketData";
import type { YieldTokenMetrics } from "@/lib/dcaYieldFilter";
import type { LiveMarketRegimeRawData } from "@/lib/fetchMarketRegimeFactors";
import type { NewsArticle } from "@/lib/newsEngine";
import { registerGlobalRefreshHandler } from "@/lib/globalRefresh";
import type { TrackedAsset } from "@/lib/portfolioStorage";
import { useAppStore } from "@/src/store/useAppStore";

interface GlobalDataSyncProps {
  portfolioSymbols: string[];
  trackedAssets: TrackedAsset[];
}

export function GlobalDataSync({
  portfolioSymbols,
  trackedAssets,
}: GlobalDataSyncProps) {
  const setGlobalLiveData = useAppStore((state) => state.setGlobalLiveData);
  const setApiStatus = useAppStore((state) => state.setApiStatus);
  const setNewsArticles = useAppStore((state) => state.setNewsArticles);
  const setNewsError = useAppStore((state) => state.setNewsError);

  const tokensParam = useMemo(
    () =>
      JSON.stringify(
        trackedAssets.map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          logoUrl: asset.logoUrl,
          coingeckoId: asset.coingeckoId,
        })),
      ),
    [trackedAssets],
  );

  const symbolsKey = portfolioSymbols.join(",");

  const syncAll = useCallback(async () => {
    const dcaParams = new URLSearchParams();
    if (portfolioSymbols.length > 0) {
      dcaParams.set("symbols", portfolioSymbols.join(","));
    }
    const dcaQuery = dcaParams.toString();
    const newsQuery = trackedAssets.length
      ? `?tokens=${encodeURIComponent(tokensParam)}`
      : "";

    const [dcaRes, yieldRes, regimeRes, technicalsRes, newsRes] = await Promise.allSettled([
      fetch(`/api/dca${dcaQuery ? `?${dcaQuery}` : ""}`, { cache: "no-store" }),
      fetch("/api/dca/yield-metrics", { cache: "no-store" }),
      fetch("/api/dca/market-regime-factors", { cache: "no-store" }),
      fetch("/api/dca/token-technicals", { cache: "no-store" }),
      fetch(`/api/news${newsQuery}`, { cache: "no-store" }),
    ]);

    if (dcaRes.status === "fulfilled" && dcaRes.value.ok) {
      const json = (await dcaRes.value.json()) as {
        success: boolean;
        snapshot?: DcaMarketSnapshot;
        fetchedAt?: string;
        error?: string;
      };
      if (json.success && json.snapshot) {
        setGlobalLiveData({ dcaSnapshot: json.snapshot });
        setApiStatus("dca", {
          source: "aggregated",
          healthy: true,
          degraded: false,
          message: null,
          lastCheck: json.fetchedAt ?? new Date().toISOString(),
        });
      }
    }

    if (yieldRes.status === "fulfilled" && yieldRes.value.ok) {
      const json = (await yieldRes.value.json()) as {
        success: boolean;
        metrics?: Record<string, YieldTokenMetrics>;
        stakingApy?: Record<string, number>;
      };
      if (json.success && json.metrics) {
        setGlobalLiveData({
          yieldMetrics: json.metrics,
          stakingApy: json.stakingApy ?? {},
        });
      }
    }

    if (regimeRes.status === "fulfilled" && regimeRes.value.ok) {
      const json = (await regimeRes.value.json()) as {
        success: boolean;
        data?: LiveMarketRegimeRawData;
      };
      if (json.success && json.data) {
        setGlobalLiveData({ regimeFactors: json.data });
      }
    }

    if (technicalsRes.status === "fulfilled" && technicalsRes.value.ok) {
      const json = (await technicalsRes.value.json()) as {
        success: boolean;
        technicals?: Record<string, import("@/lib/tokenExecutionTechnicals").TokenExecutionTechnicals>;
      };
      if (json.success && json.technicals) {
        setGlobalLiveData({ tokenTechnicals: json.technicals });
      }
    }

    if (newsRes.status === "fulfilled" && newsRes.value.ok) {
      const json = (await newsRes.value.json()) as {
        success: boolean;
        articles?: unknown[];
        heroArticleId?: string | null;
        flashArticleId?: string | null;
        fetchedAt?: string;
        error?: string;
      };
      if (json.success) {
        setNewsArticles({
          articles: (json.articles ?? []) as NewsArticle[],
          heroArticleId: json.heroArticleId ?? null,
          flashArticleId: json.flashArticleId ?? null,
          fetchedAt: json.fetchedAt,
        });
        setApiStatus("news", {
          source: "aggregated",
          healthy: true,
          degraded: false,
          message: null,
          lastCheck: json.fetchedAt ?? new Date().toISOString(),
        });
      } else {
        setNewsError(json.error ?? "Nepodarilo sa načítať správy");
      }
    }
  }, [
    portfolioSymbols,
    setApiStatus,
    setGlobalLiveData,
    setNewsArticles,
    setNewsError,
    tokensParam,
    trackedAssets.length,
    symbolsKey,
  ]);

  useEffect(() => {
    return registerGlobalRefreshHandler("global-data-sync", syncAll);
  }, [syncAll]);

  return null;
}
