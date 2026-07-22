import { GAS_LIMITS } from "@/lib/ethDefi/constants";

export interface GasFeeEstimate {
  gasLimit: number;
  gwei: number;
  ethCost: number;
  usdCost: number;
}

export function computeGasFeeUsd(
  gasLimit: number,
  gwei: number,
  ethPriceUsd: number,
): GasFeeEstimate {
  const ethCost = (gasLimit * gwei) / 1_000_000_000;
  const usdCost = ethCost * ethPriceUsd;
  return {
    gasLimit,
    gwei,
    ethCost: round6(ethCost),
    usdCost: round2(usdCost),
  };
}

export function estimateNativeMintGas(
  gwei: number,
  ethPriceUsd: number,
): GasFeeEstimate {
  return computeGasFeeUsd(GAS_LIMITS.nativeMint, gwei, ethPriceUsd);
}

export function estimateDexSwapGas(
  gwei: number,
  ethPriceUsd: number,
): GasFeeEstimate {
  return computeGasFeeUsd(GAS_LIMITS.dexSwap, gwei, ethPriceUsd);
}

export function estimateEarnEthDepositGas(
  gwei: number,
  ethPriceUsd: number,
): GasFeeEstimate {
  return computeGasFeeUsd(GAS_LIMITS.earnEthDeposit, gwei, ethPriceUsd);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
