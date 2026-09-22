"use client";

import { create } from "zustand";
import type { BasketMix, FinalBudgets } from "@/lib/dca/types";

export interface CapitalPipelineState {
  baseAmount: number;
  deploymentScore: number;
  allocationPercent: number;
  deployedCapital: number;
  undeployedToReserve: number;
  confluence: number;
  basketSplits: BasketMix;
  finalBudgets: FinalBudgets;
  setPipeline: (pipeline: Omit<CapitalPipelineState, "setPipeline">) => void;
}

const EMPTY_BASKET: BasketMix = {
  corePercent: 50,
  satellitePercent: 50,
  highBetaPercent: 0,
};

const EMPTY_BUDGETS: FinalBudgets = {
  coreUsd: 0,
  satelliteUsd: 0,
  highBetaUsd: 0,
};

export const useCapitalStore = create<CapitalPipelineState>((set) => ({
  baseAmount: 0,
  deploymentScore: 0,
  allocationPercent: 0,
  deployedCapital: 0,
  undeployedToReserve: 0,
  confluence: 0,
  basketSplits: EMPTY_BASKET,
  finalBudgets: EMPTY_BUDGETS,
  setPipeline: (pipeline) => set(pipeline),
}));
