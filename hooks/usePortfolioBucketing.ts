"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computePortfolioBucketing,
  type PortfolioBucketingResult,
} from "@/lib/dcaPortfolioBucketing";
import type { YieldTokenMetrics } from "@/lib/dcaYieldFilter";
import type { MasterTokenPlan } from "@/lib/masterDcaEngine";
import type { MacroRegime } from "@/lib/ultimateDcaEngine";

const REFRESH_MS = 5 * 60_000;

export function usePortfolioBucketing(input: {
  deployedCapital: number;
  tokenPlans: MasterTokenPlan[];
  regime: MacroRegime;
  regimeLabel: string;
  finalScore: number;
  enabled?: boolean;
}) {
  const [yieldMetrics, setYieldMetrics] = useState<
    Record<string, YieldTokenMetrics>
  >({});
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const refreshMetrics = useCallback(async () => {
    if (input.enabled === false) return;

    setMetricsLoading(true);
    try {
      const res = await fetch("/api/dca/yield-metrics", { cache: "no-store" });
      if (!res.ok) throw new Error("Yield metrics unavailable");

      const json = (await res.json()) as {
        success: boolean;
        metrics?: Record<string, YieldTokenMetrics>;
        error?: string;
      };

      if (!json.success || !json.metrics) {
        throw new Error(json.error ?? "Yield metrics unavailable");
      }

      setYieldMetrics(json.metrics);
      setMetricsError(null);
    } catch (error) {
      setMetricsError(
        error instanceof Error ? error.message : "Yield metrics unavailable",
      );
    } finally {
      setMetricsLoading(false);
    }
  }, [input.enabled]);

  useEffect(() => {
    void refreshMetrics();
    const interval = setInterval(() => {
      void refreshMetrics();
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [refreshMetrics]);

  const bucketing = useMemo<PortfolioBucketingResult | null>(() => {
    if (input.enabled === false || input.deployedCapital <= 0) return null;

    return computePortfolioBucketing({
      deployedCapital: input.deployedCapital,
      tokenPlans: input.tokenPlans,
      regime: input.regime,
      regimeLabel: input.regimeLabel,
      finalScore: input.finalScore,
      yieldMetrics,
    });
  }, [
    input.deployedCapital,
    input.tokenPlans,
    input.regime,
    input.regimeLabel,
    input.finalScore,
    input.enabled,
    yieldMetrics,
  ]);

  return {
    bucketing,
    metricsLoading,
    metricsError,
    refreshMetrics,
    liveMetricsCount: Object.keys(yieldMetrics).length,
  };
}
