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
// Pure + testable: given the raw pool list, pick the canonical staking APY for
// ETH (Rocket Pool rETH) and SOL (Marinade Native). Prefer `apyBase` (pure
// staking yield) over `apy` (which can include reward farming).

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

/** DefiLlama project slug for the ETH staking provider (Rocket Pool). */
export const ETH_STAKING_PROJECT = 'rocket-pool';
/** DefiLlama symbol for the Rocket Pool liquid staking token. */
export const ETH_STAKING_SYMBOL = 'RETH';

/**
 * DefiLlama project slugs for the SOL staking provider (Marinade Native), in
 * priority order. Marinade Native is preferred; if the feed does not expose the
 * native product as a standalone pool we fall back to Marinade's liquid-staking
 * (mSOL) pool, which tracks the same underlying Marinade validator yield.
 */
export const SOL_STAKING_PROJECT_PRIORITY = [
  'marinade-native-staking',
  'marinade-native',
  'marinade-liquid-staking',
];

/** Canonical ETH staking APY — Rocket Pool rETH on Ethereum. */
export function selectEthStakingApy(pools: LlamaPool[]): number | null {
  if (!Array.isArray(pools)) return null;
  const rocketPool = pools.find(
    p => (p.chain ?? '') === 'Ethereum'
      && (p.project ?? '') === ETH_STAKING_PROJECT
      && (p.symbol ?? '').toUpperCase() === ETH_STAKING_SYMBOL,
  );
  const apy = rocketPool ? poolApy(rocketPool) : null;
  return apy !== null && apy > 0 && apy < 100 ? apy : null;
}

/** Canonical SOL staking APY — Marinade Native (fallback: Marinade liquid mSOL). */
export function selectSolStakingApy(pools: LlamaPool[]): number | null {
  if (!Array.isArray(pools)) return null;
  for (const project of SOL_STAKING_PROJECT_PRIORITY) {
    const pool = pools.find(
      p => (p.chain ?? '') === 'Solana' && (p.project ?? '') === project,
    );
    const apy = pool ? poolApy(pool) : null;
    if (apy !== null && apy > 0 && apy < 100) return apy;
  }
  return null;
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
