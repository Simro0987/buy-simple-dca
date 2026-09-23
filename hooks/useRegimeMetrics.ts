"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { EMPTY_REGIME_METRICS } from "@/lib/dca/confluence";
import type { RegimeMetrics } from "@/lib/dca/types";
import { useRegimeStore } from "@/store/regimeStore";

export function useRegimeMetrics() {
  const metrics = useRegimeStore(
    useShallow((state) => ({
      fearGreed: state.fearGreed,
      fearGreedLabel: state.fearGreedLabel,
      stablecoinMcapUsd: state.stablecoinMcapUsd,
      stablecoinChange30d: state.stablecoinChange30d,
      cbbi: state.cbbi,
      cbbiMock: state.cbbiMock,
      fetchedAt: state.fetchedAt,
    })),
  );
  const setMetrics = useRegimeStore((state) => state.setMetrics);
  const [loading, setLoading] = useState(!metrics.fetchedAt);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/dca/regime", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Regime API HTTP ${response.status}`);
        }
        const json = (await response.json()) as RegimeMetrics;
        if (cancelled) return;
        setMetrics({
          ...EMPTY_REGIME_METRICS,
          ...json,
          fetchedAt: json.fetchedAt ?? new Date().toISOString(),
        });
        setStale(false);
        setError(
          json.fearGreed == null
            ? "Fear & Greed API nevrátila hodnotu."
            : null,
        );
      } catch {
        if (cancelled) return;
        const current = useRegimeStore.getState();
        setStale(Boolean(current.fetchedAt));
        setError(
          current.fearGreed == null
            ? "Fear & Greed / DefiLlama sa nepodarilo načítať."
            : "Regime API nedostupné · posledné live dáta.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const id = window.setInterval(() => void load(), 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setMetrics]);

  return { metrics, loading, error, stale };
}
