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

// Fallback constants — used when the live yields API is unreachable.
// `inflationPct` is a hardcoded base network-inflation rate (SOL ~5 %, ETH
// ~0.5 %) that is combined with the LIVE staking APY when available.
// (ETH: modest staking APY, near-zero post-Merge issuance → solid real yield.
//  SOL: high staking APY but higher inflation → strong but partly eroded yield.)
export const ETH_REAL_YIELD: RealYieldConfig = { grossApyPct: 3.5, inflationPct: 0.5 };
export const SOL_REAL_YIELD: RealYieldConfig = { grossApyPct: 9.0, inflationPct: 5.0 };

/** RYI = APY − inflation. */
export function realYieldIndex(cfg: RealYieldConfig): number {
  const apy = Number.isFinite(cfg?.grossApyPct) ? cfg.grossApyPct : 0;
  const infl = Number.isFinite(cfg?.inflationPct) ? cfg.inflationPct : 0;
  return apy - infl;
}

/** Compute RYI directly from a live gross APY and a base inflation rate. */
export function ryiFromApy(grossApyPct: number, inflationPct: number): number {
  const apy = Number.isFinite(grossApyPct) ? grossApyPct : 0;
  const infl = Number.isFinite(inflationPct) ? inflationPct : 0;
  return apy - infl;
}

// ─── Live staking-APY selection from the DefiLlama /pools payload ─────────────
// Pure + testable: given the raw pool list, pick a representative canonical
// staking APY for ETH (Lido stETH) and SOL (Jito / Marinade LSTs). Prefer
// `apyBase` (pure staking yield) over `apy` (which can include reward farming).

export interface LlamaPool {
  chain?: string;
  project?: string;
  symbol?: string;
  apy?: number | null;
  apyBase?: number | null;
}

function poolApy(p: LlamaPool): number | null {
  const base = typeof p.apyBase === 'number' && p.apyBase > 0 ? p.apyBase : null;
  if (base !== null) return base;
  const total = typeof p.apy === 'number' && p.apy > 0 ? p.apy : null;
  return total;
}

/** Canonical ETH staking APY — Lido stETH on Ethereum. */
export function selectEthStakingApy(pools: LlamaPool[]): number | null {
  if (!Array.isArray(pools)) return null;
  const lido = pools.find(
    p => (p.chain ?? '') === 'Ethereum'
      && (p.project ?? '') === 'lido'
      && (p.symbol ?? '').toUpperCase() === 'STETH',
  );
  const apy = lido ? poolApy(lido) : null;
  return apy !== null && apy > 0 && apy < 100 ? apy : null;
}

/** Canonical SOL staking APY — prefer Jito, then Marinade / other major LSTs. */
export function selectSolStakingApy(pools: LlamaPool[]): number | null {
  if (!Array.isArray(pools)) return null;
  const isSolLst = (p: LlamaPool) =>
    (p.chain ?? '') === 'Solana'
    && ['JITOSOL', 'MSOL', 'BSOL', 'JSOL', 'INF'].includes((p.symbol ?? '').toUpperCase());
  const candidates = pools.filter(isSolLst);
  if (!candidates.length) return null;
  const preferred =
    candidates.find(p => (p.project ?? '').includes('jito'))
    ?? candidates.find(p => (p.project ?? '').includes('marinade'))
    ?? candidates[0];
  const apy = poolApy(preferred);
  return apy !== null && apy > 0 && apy < 100 ? apy : null;
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
