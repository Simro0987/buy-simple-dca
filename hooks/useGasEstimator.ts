"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import {
  ETH_PUBLIC_RPC,
  FALLBACK_BASE_FEE_GWEI,
} from "@/lib/ethDefi/constants";
import {
  estimateDexSwapGas,
  estimateEarnEthDepositGas,
  estimateNativeMintGas,
} from "@/lib/ethDefi/gasEstimator";

export interface GasEstimatorState {
  baseFeeGwei: number;
  fastFeeGwei: number;
  source: "live" | "fallback";
  nativeMintGasUsd: (ethPriceUsd: number) => number;
  dexSwapGasUsd: (ethPriceUsd: number) => number;
  earnEthDepositGasUsd: (ethPriceUsd: number) => number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(ETH_PUBLIC_RPC),
});

/** Module 2 — Gas Estimator cez viem getFeeData(). */
export function useGasEstimator(ethPriceUsd: number): GasEstimatorState {
  const [baseFeeGwei, setBaseFeeGwei] = useState(FALLBACK_BASE_FEE_GWEI);
  const [source, setSource] = useState<"live" | "fallback">("fallback");

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [block, fees] = await Promise.all([
          publicClient.getBlock({ blockTag: "latest" }),
          publicClient.estimateFeesPerGas(),
        ]);

        const baseFee = block.baseFeePerGas ?? fees.maxFeePerGas ?? fees.gasPrice;
        if (!baseFee) throw new Error("no fee data");

        const gwei = Number(baseFee) / 1e9;
        if (!Number.isFinite(gwei) || gwei <= 0) throw new Error("invalid gwei");

        if (active) {
          setBaseFeeGwei(round2(gwei));
          setSource("live");
        }
      } catch {
        if (active) {
          setBaseFeeGwei(FALLBACK_BASE_FEE_GWEI);
          setSource("fallback");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const fastFeeGwei = round2(baseFeeGwei * 1.25 + 1.5);

  return {
    baseFeeGwei,
    fastFeeGwei,
    source,
    nativeMintGasUsd: (price) =>
      estimateNativeMintGas(fastFeeGwei, price).usdCost,
    dexSwapGasUsd: (price) => estimateDexSwapGas(fastFeeGwei, price).usdCost,
    earnEthDepositGasUsd: (price) =>
      estimateEarnEthDepositGas(fastFeeGwei, price).usdCost,
  };
}

/** Convenience: formátovaný gas string pre UI. */
export function formatGasEstimate(usd: number): string {
  return `gas ~$${usd.toFixed(2)}`;
}
