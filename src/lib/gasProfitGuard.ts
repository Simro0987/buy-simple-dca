// ============================================================================
// Gas-to-Profit Fee Protection
// Ak odhadovaný gas > 15 % projektovaného výnosu, presun sa neoplatí.
// Výnos sa projektuje na definovaný horizont (default 1 rok).
// ============================================================================

export const GAS_RATIO_LIMIT = 0.15;

export interface GasGuardResult {
  /** Projektovaný výnos v USD za horizont */
  projectedYieldUsd: number;
  /** gas / výnos (0..∞); 0 ak výnos nie je vyčísliteľný */
  ratio: number;
  /** true = presun sa neoplatí */
  blocked: boolean;
  gasUsd: number;
  horizonDays: number;
}

export function evaluateGasGuard(params: {
  /** Hodnota presúvaného kapitálu v USD */
  amountUsd: number;
  /** Ročné APY v % (net) */
  apyPct: number;
  /** Odhadovaný gas v USD */
  gasUsd: number;
  /** Horizont projekcie v dňoch (default 365) */
  horizonDays?: number;
}): GasGuardResult {
  const horizonDays = params.horizonDays ?? 365;
  const projectedYieldUsd = Math.max(
    0,
    params.amountUsd * (params.apyPct / 100) * (horizonDays / 365),
  );
  const gasUsd = Math.max(0, params.gasUsd);
  const ratio = projectedYieldUsd > 0 ? gasUsd / projectedYieldUsd : gasUsd > 0 ? Infinity : 0;
  const blocked = params.amountUsd > 0 && gasUsd > 0 && ratio > GAS_RATIO_LIMIT;
  return { projectedYieldUsd, ratio, blocked, gasUsd, horizonDays };
}
