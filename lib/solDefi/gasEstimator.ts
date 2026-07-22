import { LAMPORTS_PER_SOL, SOL_FEE_ESTIMATES } from "@/lib/solDefi/constants";

export interface SolGasFeeEstimate {
  lamports: number;
  solCost: number;
  usdCost: number;
}

export function solToUsd(sol: number, solPriceUsd: number): number {
  return round2(sol * solPriceUsd);
}

export function computeSolGasFeeUsd(
  solCost: number,
  solPriceUsd: number,
): SolGasFeeEstimate {
  const lamports = Math.round(solCost * LAMPORTS_PER_SOL);
  return {
    lamports,
    solCost: round6(solCost),
    usdCost: solToUsd(solCost, solPriceUsd),
  };
}

export function estimateNativeStakeGas(solPriceUsd: number): SolGasFeeEstimate {
  return computeSolGasFeeUsd(SOL_FEE_ESTIMATES.nativeStake, solPriceUsd);
}

export function estimateDexSwapGas(solPriceUsd: number): SolGasFeeEstimate {
  const mid =
    (SOL_FEE_ESTIMATES.dexSwapMin + SOL_FEE_ESTIMATES.dexSwapMax) / 2;
  return computeSolGasFeeUsd(mid, solPriceUsd);
}

export function estimateRestakingDepositGas(
  solPriceUsd: number,
): SolGasFeeEstimate {
  return computeSolGasFeeUsd(SOL_FEE_ESTIMATES.restakingDeposit, solPriceUsd);
}

export function formatSolGasEstimate(usd: number): string {
  return `Gas: ~$${usd.toFixed(2)}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
