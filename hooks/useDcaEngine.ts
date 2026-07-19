"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DcaMarketSnapshot } from "@/lib/dcaMarketData";
import {
  computeMasterDcaEngine,
  toExecutionPlans,
  type MasterDcaResult,
} from "@/lib/masterDcaEngine";
import type { Transaction } from "@/lib/portfolioStorage";
import { useAppStore } from "@/store/useAppStore";

interface UseDcaEngineOptions {
  portfolioSymbols?: string[];
  dcaTransactions?: Transaction[];
}

interface DcaApiResponse {
  success: boolean;
  snapshot?: DcaMarketSnapshot;
  error?: string;
}

export function useDcaEngine({
  portfolioSymbols = [],
  dcaTransactions = [],
}: UseDcaEngineOptions = {}) {
  const weeklyBudget = useAppStore((state) => state.dcaSettings.weeklyBudget);
  const setExecutionPlans = useAppStore((state) => state.setExecutionPlans);

  const [snapshot, setSnapshot] = useState<DcaMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const symbolsKey = portfolioSymbols.join(",");

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (portfolioSymbols.length > 0) {
        params.set("symbols", portfolioSymbols.join(","));
      }
      const query = params.toString();
      const res = await fetch(`/api/dca${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DcaApiResponse;
      if (!json.success || !json.snapshot) {
        throw new Error(json.error ?? "Failed to load DCA market data");
      }
      setSnapshot(json.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [symbolsKey, portfolioSymbols]);

  useEffect(() => {
    void loadSnapshot();
    const interval = setInterval(() => {
      void loadSnapshot();
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [loadSnapshot]);

  const result: MasterDcaResult | null = useMemo(() => {
    if (!snapshot) return null;

    const txData = dcaTransactions
      .filter((tx) => tx.type === "DCA")
      .map((tx) => ({
        symbol: tx.symbol,
        spentUsd: tx.spentUsd,
        priceUsd: tx.priceUsd,
        amount: tx.amount,
      }));

    return computeMasterDcaEngine({
      weeklyBudget,
      snapshot,
      portfolioSymbols,
      dcaTransactions: txData,
    });
  }, [snapshot, weeklyBudget, portfolioSymbols, dcaTransactions]);

  useEffect(() => {
    if (result) {
      setExecutionPlans(toExecutionPlans(result));
    }
  }, [result, setExecutionPlans]);

  return {
    result,
    snapshot,
    loading,
    error,
    weeklyBudget,
    refresh: loadSnapshot,
  };
}
