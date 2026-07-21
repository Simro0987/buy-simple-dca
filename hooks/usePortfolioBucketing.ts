"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computePortfolioBucketing,
  type PortfolioBucketingResult,
} from "@/lib/dcaPortfolioBucketing";
import type { YieldTokenMetrics } from "@/lib/dcaYieldFilter";
import { GLOBAL_REFRESH_EVENT } from "@/lib/globalRefresh";
import type { MasterTokenPlan } from "@/lib/masterDcaEngine";
import type { MacroRegime } from "@/lib/ultimateDcaEngine";
import { useAppStore } from "@/src/store/useAppStore";

export function usePortfolioBucketing(input: {
  deployedCapital: number;
  tokenPlans: MasterTokenPlan[];
  regime: MacroRegime;
  regimeLabel: string;
  finalScore: number;
  enabled?: boolean;
}) {
  const globalYieldMetrics = useAppStore(
    (state) => state.globalLiveData.yieldMetrics,
  );
  const globalStakingApy = useAppStore(
    (state) => state.globalLiveData.stakingApy,
  );
  const isRefreshing = useAppStore((state) => state.globalRefresh.isRefreshing);

  const [yieldMetrics, setYieldMetrics] = useState<
    Record<string, YieldTokenMetrics>
  >(globalYieldMetrics);
  const [stakingApy, setStakingApy] = useState<Record<string, number>>(
    globalStakingApy,
  );
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const syncFromStore = useCallback(() => {
    const live = useAppStore.getState().globalLiveData;
    setYieldMetrics(live.yieldMetrics);
    setStakingApy(live.stakingApy);
    if (Object.keys(live.yieldMetrics).length > 0) {
      setMetricsError(null);
    }
  }, []);

  useEffect(() => {
    syncFromStore();
  }, [globalYieldMetrics, globalStakingApy, syncFromStore]);

  useEffect(() => {
    const onGlobalRefresh = () => {
      syncFromStore();
    };
    window.addEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
    return () => window.removeEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
  }, [syncFromStore]);

  const metricsLoading =
    input.enabled !== false &&
    isRefreshing &&
    Object.keys(yieldMetrics).length === 0;

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
    refreshMetrics: syncFromStore,
    liveMetricsCount: Object.keys(yieldMetrics).length,
    yieldMetrics,
    stakingApy,
  };
}
