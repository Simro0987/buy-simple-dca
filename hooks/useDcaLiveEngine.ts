"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAndCalculateDCA,
  type DcaLiveCalculation,
} from "@/lib/fetchAndCalculateDCA";
import type { DcaMarketSnapshot } from "@/lib/dcaMarketData";
import { GLOBAL_REFRESH_EVENT } from "@/lib/globalRefresh";
import type { Transaction } from "@/lib/portfolioStorage";

export function useDcaLiveEngine(input: {
  weeklyBudget: number;
  portfolioSymbols?: string[];
  dcaTransactions?: Transaction[];
  tokenSnapshot?: DcaMarketSnapshot["tokens"];
}) {
  const [result, setResult] = useState<DcaLiveCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const hasResultRef = useRef(false);

  const tokenSnapshotKey = input.tokenSnapshot
    ? Object.keys(input.tokenSnapshot).sort().join(",")
    : "";

  const refresh = useCallback(async () => {
    if (!hasResultRef.current) setLoading(true);
    try {
      const calc = await fetchAndCalculateDCA({
        weeklyBudget: input.weeklyBudget,
        portfolioSymbols: input.portfolioSymbols,
        dcaTransactions: input.dcaTransactions,
        tokenSnapshot: input.tokenSnapshot,
      });
      setResult(calc);
      hasResultRef.current = true;
    } catch {
      if (!hasResultRef.current) setResult(null);
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
  }, [refresh]);

  useEffect(() => {
    const onGlobalRefresh = () => {
      void refresh();
    };
    window.addEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
    return () => window.removeEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
  }, [refresh]);

  return { result, loading, refresh };
}
