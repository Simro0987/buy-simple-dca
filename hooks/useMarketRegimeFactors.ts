"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveMarketRegimeRawData } from "@/lib/fetchMarketRegimeFactors";
import { GLOBAL_REFRESH_EVENT } from "@/lib/globalRefresh";
import { useAppStore } from "@/src/store/useAppStore";

const CACHE_KEY = "edge-trader-market-regime-factors";

function readCache(): LiveMarketRegimeRawData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as LiveMarketRegimeRawData) : null;
  } catch {
    return null;
  }
}

function writeCache(data: LiveMarketRegimeRawData): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

export function useMarketRegimeFactors() {
  const globalFactors = useAppStore(
    (state) => state.globalLiveData.regimeFactors,
  );
  const isRefreshing = useAppStore((state) => state.globalRefresh.isRefreshing);

  const [data, setData] = useState<LiveMarketRegimeRawData | null>(
    globalFactors ?? readCache(),
  );
  const [error, setError] = useState<string | null>(null);

  const syncFromStore = useCallback(() => {
    const live = useAppStore.getState().globalLiveData.regimeFactors;
    if (live) {
      setData(live);
      writeCache(live);
      setError(live.degraded ? "Čiastočné dáta — niektoré zdroje nedostupné" : null);
      return;
    }

    const cached = readCache();
    if (cached) {
      setData(cached);
    }
  }, []);

  useEffect(() => {
    syncFromStore();
  }, [globalFactors, syncFromStore]);

  useEffect(() => {
    const onGlobalRefresh = () => {
      syncFromStore();
    };
    window.addEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
    return () => window.removeEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
  }, [syncFromStore]);

  const loading = isRefreshing && !data;

  return { data, loading, error, refresh: syncFromStore };
}
