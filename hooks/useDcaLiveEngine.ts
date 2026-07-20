"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAndCalculateDCA,
  type DcaLiveCalculation,
} from "@/lib/fetchAndCalculateDCA";
import type { DcaMarketSnapshot } from "@/lib/dcaMarketData";
import type { Transaction } from "@/lib/portfolioStorage";

export function useDcaLiveEngine(input: {
  weeklyBudget: number;
  portfolioSymbols?: string[];
  dcaTransactions?: Transaction[];
  tokenSnapshot?: DcaMarketSnapshot["tokens"];
}) {
  const [result, setResult] = useState<DcaLiveCalculation | null>(null);
  const [loading, setLoading] = useState(true);

  const tokenSnapshotKey = input.tokenSnapshot
    ? Object.keys(input.tokenSnapshot).sort().join(",")
    : "";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const calc = await fetchAndCalculateDCA({
        weeklyBudget: input.weeklyBudget,
        portfolioSymbols: input.portfolioSymbols,
        dcaTransactions: input.dcaTransactions,
        tokenSnapshot: input.tokenSnapshot,
      });
      setResult(calc);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [
    input.weeklyBudget,
    input.portfolioSymbols,
    input.dcaTransactions,
    tokenSnapshotKey,
    input.tokenSnapshot,
  ]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { result, loading, refresh };
}
