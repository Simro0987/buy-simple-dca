"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EMPTY_REGIME_METRICS } from "@/lib/dca/confluence";
import type { RegimeMetrics } from "@/lib/dca/types";

interface RegimeStore extends RegimeMetrics {
  setMetrics: (metrics: RegimeMetrics) => void;
}

export const useRegimeStore = create<RegimeStore>()(
  persist(
    (set) => ({
      ...EMPTY_REGIME_METRICS,
      setMetrics: (metrics) => set(metrics),
    }),
    {
      name: "edge-trader-regime-metrics",
      partialize: (state) => ({
        fearGreed: state.fearGreed,
        fearGreedLabel: state.fearGreedLabel,
        stablecoinMcapUsd: state.stablecoinMcapUsd,
        stablecoinChange30d: state.stablecoinChange30d,
        cbbi: state.cbbi,
        cbbiMock: state.cbbiMock,
        fetchedAt: state.fetchedAt,
      }),
    },
  ),
);
