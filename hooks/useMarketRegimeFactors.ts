"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveMarketRegimeRawData } from "@/lib/fetchMarketRegimeFactors";

const REFRESH_MS = 5 * 60_000;
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
  const [data, setData] = useState<LiveMarketRegimeRawData | null>(readCache);
  const [loading, setLoading] = useState(!readCache());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dca/market-regime-factors", {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: LiveMarketRegimeRawData;
        error?: string;
      };

      if (!json.success || !json.data) {
        throw new Error(json.error ?? "Market regime factors unavailable");
      }

      setData(json.data);
      writeCache(json.data);
      setError(json.data.degraded ? "Čiastočné dáta — niektoré zdroje nedostupné" : null);
    } catch (err) {
      const cached = readCache();
      if (cached) {
        setData(cached);
        setError(
          err instanceof Error
            ? `${err.message} — zobrazené cache dáta`
            : "Zobrazené cache dáta",
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Market regime factors unavailable",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, loading, error, refresh };
}
