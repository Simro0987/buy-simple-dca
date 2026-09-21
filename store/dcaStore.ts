"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AllocationMode, DcaSymbol } from "@/lib/dca/types";
import { DEFAULT_WEEKLY_INVESTMENT } from "@/lib/dcaEngineConfig";

type Side = "market" | "limit";

interface DcaPersistedState {
  weeklyAmount: number;
  moneyMode: boolean;
  allocationMode: AllocationMode;
}

interface DcaStore extends DcaPersistedState {
  ritualOpen: boolean;
  whyOpen: boolean;
  activations: Partial<Record<DcaSymbol, { market: boolean; limit: boolean }>>;
  setWeeklyAmount: (value: number) => void;
  setMoneyMode: (value: boolean) => void;
  toggleMoneyMode: () => void;
  setAllocationMode: (mode: AllocationMode) => void;
  autoFill: () => void;
  setRitualOpen: (open: boolean) => void;
  setWhyOpen: (open: boolean) => void;
  toggleActivation: (symbol: DcaSymbol, side: Side) => void;
}

export const useDcaStore = create<DcaStore>()(
  persist(
    (set) => ({
      weeklyAmount: DEFAULT_WEEKLY_INVESTMENT,
      moneyMode: true,
      allocationMode: "ALL",
      ritualOpen: false,
      whyOpen: false,
      activations: {},
      setWeeklyAmount: (value) =>
        set({ weeklyAmount: Math.max(0, Number.isFinite(value) ? value : 0) }),
      setMoneyMode: (value) => set({ moneyMode: value }),
      toggleMoneyMode: () => set((state) => ({ moneyMode: !state.moneyMode })),
      setAllocationMode: (allocationMode) => set({ allocationMode }),
      autoFill: () => set({ weeklyAmount: DEFAULT_WEEKLY_INVESTMENT }),
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
      partialize: (state) => ({
        weeklyAmount: state.weeklyAmount,
        moneyMode: state.moneyMode,
        allocationMode: state.allocationMode,
      }),
    },
  ),
);
