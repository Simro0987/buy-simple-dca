"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DcaSymbol } from "@/lib/dca/types";

interface KnifeState {
  latched: Partial<Record<DcaSymbol, boolean>>;
  setLatched: (latched: Partial<Record<DcaSymbol, boolean>>) => void;
}

export const useKnifeStore = create<KnifeState>()(
  persist(
    (set) => ({
      latched: {},
      setLatched: (latched) => set({ latched }),
    }),
    { name: "edge-trader-falling-knife" },
  ),
);
