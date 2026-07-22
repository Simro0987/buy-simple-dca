"use client";

import { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";
import {
  LAMPORTS_PER_SOL,
  SOLANA_RPC_URL,
  SOL_FEE_ESTIMATES,
} from "@/lib/solDefi/constants";
import {
  estimateDexSwapGas,
  estimateNativeStakeGas,
  formatSolGasEstimate,
} from "@/lib/solDefi/gasEstimator";

export interface SolanaGasEstimatorState {
  baseFeeLamports: number;
  priorityFeeLamports: number;
  totalFeeSol: number;
  source: "live" | "fallback";
  nativeStakeGasUsd: (solPriceUsd: number) => number;
  dexSwapGasUsd: (solPriceUsd: number) => number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Module 2 — Solana gas estimator cez @solana/web3.js RPC. */
export function useSolanaGasEstimator(solPriceUsd: number): SolanaGasEstimatorState {
  const [baseFeeLamports, setBaseFeeLamports] = useState(5000);
  const [priorityFeeLamports, setPriorityFeeLamports] = useState(0);
  const [source, setSource] = useState<"live" | "fallback">("fallback");

  useEffect(() => {
    let active = true;
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");

    void (async () => {
      try {
        const [fees, latestBlockhash] = await Promise.all([
          connection.getRecentPrioritizationFees(),
          connection.getLatestBlockhash(),
        ]);

        const baseFee = 5000;
        let priority = 0;
        if (fees.length > 0) {
          const sorted = fees
            .map((f) => f.prioritizationFee)
            .filter((f) => f > 0)
            .sort((a, b) => a - b);
          priority = sorted[Math.floor(sorted.length / 2)] ?? 0;
        }

        if (active && latestBlockhash) {
          setBaseFeeLamports(baseFee);
          setPriorityFeeLamports(priority);
          setSource("live");
        }
      } catch {
        if (active) {
          setBaseFeeLamports(5000);
          setPriorityFeeLamports(0);
          setSource("fallback");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const totalFeeSol = round6(
    (baseFeeLamports + priorityFeeLamports) / LAMPORTS_PER_SOL,
  );

  return {
    baseFeeLamports,
    priorityFeeLamports,
    totalFeeSol: totalFeeSol || SOL_FEE_ESTIMATES.nativeStake,
    source,
    nativeStakeGasUsd: (price) => estimateNativeStakeGas(price).usdCost,
    dexSwapGasUsd: (price) => estimateDexSwapGas(price).usdCost,
  };
}

export { formatSolGasEstimate };
