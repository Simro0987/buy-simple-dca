"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildTokenExecutionAdvisor,
  type TokenExecutionAdvisor,
} from "@/lib/executionLearningAdvisor";
import {
  EXECUTION_PERFORMANCE_UPDATED_EVENT,
  readExecutionPerformanceLog,
} from "@/lib/executionPerformanceLog";
import type { OctagonTokenSymbol, TokenOctagonSnapshot } from "@/lib/confluenceOctagon";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { Transaction } from "@/lib/portfolioStorage";

export function useTokenExecutionAdvisor(input: {
  symbol: OctagonTokenSymbol;
  octagon: TokenOctagonSnapshot | null;
  dcaTransactions: Transaction[];
  executionPlans: TokenExecutionPlan[];
  tokenPrices: Record<string, number>;
}) {
  const [executionLog, setExecutionLog] = useState(readExecutionPerformanceLog);

  useEffect(() => {
    const sync = () => setExecutionLog(readExecutionPerformanceLog());
    window.addEventListener(EXECUTION_PERFORMANCE_UPDATED_EVENT, sync);
    return () =>
      window.removeEventListener(EXECUTION_PERFORMANCE_UPDATED_EVENT, sync);
  }, []);

  const advisor: TokenExecutionAdvisor = useMemo(() => {
    const executionPlan =
      input.executionPlans.find((plan) => plan.symbol === input.symbol) ?? null;

    return buildTokenExecutionAdvisor({
      symbol: input.symbol,
      name: input.octagon?.name ?? input.symbol,
      octagon: input.octagon,
      executionEntries: executionLog,
      dcaTransactions: input.dcaTransactions
        .filter((tx) => tx.type === "DCA")
        .map((tx) => ({
          symbol: tx.symbol,
          spentUsd: tx.spentUsd,
          priceUsd: tx.priceUsd,
          amount: tx.amount,
          date: tx.date,
        })),
      currentPrice:
        input.tokenPrices[input.symbol] ?? input.octagon?.price ?? 0,
      executionPlan,
    });
  }, [
    executionLog,
    input.dcaTransactions,
    input.executionPlans,
    input.octagon,
    input.symbol,
    input.tokenPrices,
  ]);

  return advisor;
}
