"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AllocationMode, DcaSymbol } from "@/lib/dca/types";
import { DEFAULT_WEEKLY_INVESTMENT } from "@/lib/dcaEngineConfig";
import { DEFAULT_LMT2_MIN_USD } from "@/lib/dca/executionMath";

type Side = "market" | "limit";

interface DcaPersistedState {
  baseAmount: number;
  weeklyAmount: number;
  moneyMode: boolean;
  allocationMode: AllocationMode;
  lmt2MinUsd: number;
  allocationOverride: number | null;
}

interface DcaStore extends DcaPersistedState {
  ritualOpen: boolean;
  whyOpen: boolean;
  activations: Partial<Record<DcaSymbol, { market: boolean; limit: boolean }>>;
  setBaseAmount: (value: number) => void;
  setWeeklyAmount: (value: number) => void;
  setLmt2MinUsd: (value: number) => void;
  setMoneyMode: (value: boolean) => void;
  toggleMoneyMode: () => void;
  setAllocationMode: (mode: AllocationMode) => void;
  setAllocationOverride: (value: number | null) => void;
  autoFill: () => void;
  setRitualOpen: (open: boolean) => void;
  setWhyOpen: (open: boolean) => void;
  toggleActivation: (symbol: DcaSymbol, side: Side) => void;
}

function clampAmount(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

export const useDcaStore = create<DcaStore>()(
  persist(
    (set) => ({
      baseAmount: DEFAULT_WEEKLY_INVESTMENT,
      weeklyAmount: DEFAULT_WEEKLY_INVESTMENT,
      lmt2MinUsd: DEFAULT_LMT2_MIN_USD,
      moneyMode: true,
      allocationMode: "ALL",
      allocationOverride: null,
      ritualOpen: false,
      whyOpen: true,
      activations: {},
      setBaseAmount: (value) => {
        const baseAmount = clampAmount(value);
        set({ baseAmount, weeklyAmount: baseAmount });
      },
      setWeeklyAmount: (value) => {
        const baseAmount = clampAmount(value);
        set({ baseAmount, weeklyAmount: baseAmount });
      },
      setLmt2MinUsd: (value) =>
        set({
          lmt2MinUsd: Math.max(0, Number.isFinite(value) ? Math.round(value * 100) / 100 : DEFAULT_LMT2_MIN_USD),
        }),
      setMoneyMode: (value) => set({ moneyMode: value }),
      toggleMoneyMode: () => set((state) => ({ moneyMode: !state.moneyMode })),
      setAllocationMode: (allocationMode) => set({ allocationMode }),
      setAllocationOverride: (value) =>
        set({
          allocationOverride:
            value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value)),
        }),
      autoFill: () =>
        set({
          baseAmount: DEFAULT_WEEKLY_INVESTMENT,
          weeklyAmount: DEFAULT_WEEKLY_INVESTMENT,
          allocationOverride: null,
        }),
      setRitualOpen: (ritualOpen) => set({ ritualOpen }),
      setWhyOpen: (whyOpen) => set({ whyOpen }),
      toggleActivation: (symbol, side) =>
        set((state) => {
          const current = state.activations[symbol] ?? {
            market: false,
            limit: false,
          };
          return {
            activations: {
              ...state.activations,
              [symbol]: { ...current, [side]: !current[side] },
            },
          };
        }),
    }),
    {
      name: "edge-trader-dca-engine",
      version: 3,
      partialize: (state) => ({
        baseAmount: state.baseAmount,
        weeklyAmount: state.weeklyAmount,
        moneyMode: state.moneyMode,
        allocationMode: state.allocationMode,
        lmt2MinUsd: state.lmt2MinUsd,
        allocationOverride: state.allocationOverride,
      }),
      migrate: (persisted) => {
        const raw = persisted as Partial<DcaPersistedState>;
        const base = clampAmount(raw.baseAmount ?? raw.weeklyAmount ?? DEFAULT_WEEKLY_INVESTMENT);
        return {
          baseAmount: base,
          weeklyAmount: base,
          moneyMode: Boolean(raw.moneyMode),
          allocationMode: raw.allocationMode === "BTC_ONLY" ? "BTC_ONLY" : "ALL",
          lmt2MinUsd: raw.lmt2MinUsd ?? DEFAULT_LMT2_MIN_USD,
          allocationOverride:
            raw.allocationOverride == null || !Number.isFinite(raw.allocationOverride)
              ? null
              : raw.allocationOverride,
        };
      },
    },
  ),
);
