// ============================================================
// RYI — Real Yield Index ("Staking Booster" for the Satellite bucket)
// ============================================================
//
// RYI = Gross Staking APY (%) − Token Network Inflation (%).
//
// It acts as a yield-strength booster ALONGSIDE the existing CBBC (quality)
// bias when splitting the Satellite budget between ETH and SOL. The constants
// below are MANUALLY editable and intentionally structured as a small config
// so a future API integration can swap them out without touching the engine.

export interface RealYieldConfig {
  /** Gross staking APY, in %. */
  grossApyPct: number;
  /** Token network inflation, in %. */
  inflationPct: number;
}

// Manual constants — update as staking / inflation regimes change.
// (ETH: modest staking APY, near-zero post-Merge issuance → solid real yield.
//  SOL: high staking APY but higher inflation → strong but partly eroded yield.)
export const ETH_REAL_YIELD: RealYieldConfig = { grossApyPct: 3.5, inflationPct: 0.5 };
export const SOL_REAL_YIELD: RealYieldConfig = { grossApyPct: 8.0, inflationPct: 3.0 };

/** RYI = APY − inflation. */
export function realYieldIndex(cfg: RealYieldConfig): number {
  const apy = Number.isFinite(cfg?.grossApyPct) ? cfg.grossApyPct : 0;
  const infl = Number.isFinite(cfg?.inflationPct) ? cfg.inflationPct : 0;
  return apy - infl;
}

/**
 * Proportional multiplier: percentage points of Satellite allocation shifted
 * per 1 % of RYI difference. 1 % diff → 2 pp shift, 5 % diff → 10 pp shift.
 */
export const RYI_SHIFT_PP_PER_PCT = 2;

/**
 * Allocation shift (in percentage points) produced by the RYI difference.
 * Positive → tilt toward ETH; negative → tilt toward SOL.
 */
export function ryiAllocationShiftPp(ryiEth: number, ryiSol: number): number {
  const e = Number.isFinite(ryiEth) ? ryiEth : 0;
  const s = Number.isFinite(ryiSol) ? ryiSol : 0;
  return (e - s) * RYI_SHIFT_PP_PER_PCT;
}
