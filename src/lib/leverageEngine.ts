/**
 * Leverage / risk math for the 5-layer Stake architecture (advisory only).
 * All numbers derive from LIVE prices — no hardcoded market values.
 */

export interface AssetLeverageConfig {
  symbol: 'BTC' | 'ETH';
  collateralSymbol: string;      // cbBTC / wstETH
  reservePct: number;            // Layer 1 cold storage share
  workingPct: number;            // Layer 2 collateral share
  nativeStakePct: number;        // ETH only (0 for BTC)
  targetLtv: number;
  maxLtv: number;                // hard cap
  liqThreshold: number;          // protocol liquidation threshold
  dcaWeeks: number;
}

export const BTC_CONFIG: AssetLeverageConfig = {
  symbol: 'BTC',
  collateralSymbol: 'cbBTC',
  reservePct: 67,
  workingPct: 33,
  nativeStakePct: 0,
  targetLtv: 0.25,
  maxLtv: 0.33,
  liqThreshold: 0.78,
  dcaWeeks: 4,
};

export const ETH_CONFIG: AssetLeverageConfig = {
  symbol: 'ETH',
  collateralSymbol: 'wstETH',
  reservePct: 20,
  workingPct: 25,
  nativeStakePct: 55,
  targetLtv: 0.18,
  maxLtv: 0.25,
  liqThreshold: 0.80,
  dcaWeeks: 4,
};

/** Never plan additional borrowing beyond the asset-specific hardcap. */
export function borrowPlan(collateral: number, price: number | undefined, existingDebt: number, cfg: AssetLeverageConfig) {
  if (!price || !Number.isFinite(price) || price <= 0 || !Number.isFinite(collateral) || collateral <= 0) {
    return { targetDebt: null, additionalDebt: 0, hardcapDebt: null };
  }
  const current = Number.isFinite(existingDebt) ? Math.max(0, existingDebt) : 0;
  const hardcapDebt = collateral * price * cfg.maxLtv;
  const targetDebt = collateral * price * Math.min(cfg.targetLtv, cfg.maxLtv);
  return { targetDebt: Math.max(current, targetDebt), additionalDebt: Math.max(0, targetDebt - current), hardcapDebt };
}

export const STAKE_LAYER_COUNTS = { BTC: 5, ETH: 5, SOL: 2 } as const;

/** Weekly-deposit-only ALM event; falling LTV alone must never create a boost. */
export function weeklyDepositBoost(deposit: number, price: number | undefined, cfg: AssetLeverageConfig, enabled: boolean) {
  return enabled && Number.isFinite(deposit) && deposit > 0 && price && Number.isFinite(price) && price > 0
    ? deposit * price * Math.min(cfg.targetLtv, cfg.maxLtv) : 0;
}

/** Liquidation price of the collateral asset for a given debt + collateral size. */
export function liquidationPrice(
  collateralAmount: number,
  debtUsd: number,
  liqThreshold: number,
): number | null {
  if (!(collateralAmount > 0) || !(debtUsd > 0) || !(liqThreshold > 0)) return null;
  return debtUsd / (collateralAmount * liqThreshold);
}

/** Percentage drop from the live price to the liquidation price. */
export function distanceToLiquidation(livePrice?: number, liqPrice?: number | null): number | null {
  if (!livePrice || !liqPrice || livePrice <= 0) return null;
  return ((livePrice - liqPrice) / livePrice) * 100;
}

/**
 * ETH-only dynamic split: when DeFi supply yields are poor versus native
 * staking, capital reflows from Layer 2 collateral into native staking.
 */
export function dynamicNativeSplit(
  cfg: AssetLeverageConfig,
  defiApy: number | null | undefined,
  nativeApy: number,
): { nativePct: number; defiPct: number; favorNative: boolean } {
  const base = { nativePct: cfg.nativeStakePct, defiPct: cfg.workingPct, favorNative: false };
  if (cfg.symbol !== 'ETH') return base;
  if (defiApy == null) return base;
  const edge = defiApy - nativeApy;              // positive = DeFi wins
  if (edge >= 0.5) return base;
  // Shift up to the whole DeFi sleeve back into native staking.
  const shift = Math.min(cfg.workingPct, Math.round(Math.min(1, (0.5 - edge) / 2) * cfg.workingPct));
  return {
    nativePct: cfg.nativeStakePct + shift,
    defiPct: cfg.workingPct - shift,
    favorNative: shift > 0,
  };
}

export interface BorrowAllocation {
  stablePct: number;   // Morpho / Aave USDC vaults
  nativePct: number;   // swapped to cbBTC / wstETH, collateral disabled
  cashPct: number;     // liquid USDC in smart wallet
  regime: 'RISK-ON' | 'NEUTRAL' | 'DEFENSIVE';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * AI borrow allocator — distributes borrowed USDC across 3 isolated pillars
 * from market volatility (0-100) and the fear & greed index (0-100).
 * Fear + calm markets buy native tokens; greed + volatility hoard cash.
 */
export function allocateBorrow(marketVolatility: number, fearAndGreedIndex: number): BorrowAllocation {
  const vol = clamp(Number.isFinite(marketVolatility) ? marketVolatility : 100, 0, 100);
  const fg = clamp(Number.isFinite(fearAndGreedIndex) ? fearAndGreedIndex : 100, 0, 100);

  const nativeRaw = clamp(60 - vol * 0.45 - (fg - 50) * 0.35, 5, 60);
  const cashRaw = clamp(10 + vol * 0.4 + Math.max(0, fg - 60) * 0.25, 10, 50);
  const nativePct = Math.round(nativeRaw);
  const cashPct = Math.round(cashRaw);
  const stablePct = clamp(100 - nativePct - cashPct, 0, 100);

  const regime: BorrowAllocation['regime'] =
    nativePct >= 40 ? 'RISK-ON' : cashPct >= 35 ? 'DEFENSIVE' : 'NEUTRAL';

  return { stablePct, nativePct, cashPct: 100 - nativePct - stablePct, regime };
}

export function borrowPillars(borrowUsd: number, marketVolatility: number, fearAndGreedIndex: number) {
  const allocation = allocateBorrow(marketVolatility, fearAndGreedIndex);
  const total = Number.isFinite(borrowUsd) ? Math.max(0, borrowUsd) : 0;
  const stableUsd = total * allocation.stablePct / 100;
  const nativeUsd = total * allocation.nativePct / 100;
  return { ...allocation, stableUsd, nativeUsd, cashUsd: total - stableUsd - nativeUsd, nativeCollateralEnabled: false as const };
}

/** Current LTV from live price, collateral size and debt. */
export function currentLtv(
  collateralAmount: number,
  price: number | undefined,
  debtUsd: number | null,
): number | null {
  if (!price || !(collateralAmount > 0) || debtUsd == null) return null;
  return debtUsd / (collateralAmount * price);
}

/** USDC amount to repay so the position drops back to the target LTV. */
export function repayToTarget(
  collateralAmount: number,
  price: number | undefined,
  debtUsd: number | null,
  targetLtv: number,
): number | null {
  if (!price || !(collateralAmount > 0) || !debtUsd) return null;
  const safeDebt = collateralAmount * price * targetLtv;
  return Math.max(0, debtUsd - safeDebt);
}

export type RiskLevel = 'SAFE' | 'WATCH' | 'DANGER';

/**
 * Risk classification versus the hard cap / liquidation threshold — drives the
 * "switch to de-risking" recommendation in the UI.
 */
export function riskLevel(
  ltv: number | null,
  maxLtv: number,
  liqThreshold: number,
): RiskLevel {
  if (ltv == null) return 'SAFE';
  if (ltv >= maxLtv || ltv >= liqThreshold * 0.8) return 'DANGER';
  if (ltv >= maxLtv * 0.85) return 'WATCH';
  return 'SAFE';
}

/** Repay only recovered funds; withdrawing collateral must preserve the safe LTV. */
export function unwindPlan(collateral: number, price: number | undefined, debt: number, recoveredUsdc: number, cfg: AssetLeverageConfig) {
  const safeLtv = Math.max(0.05, cfg.targetLtv - 0.1);
  const available = Number.isFinite(recoveredUsdc) ? Math.max(0, recoveredUsdc) : 0;
  if (!price || !Number.isFinite(price) || price <= 0 || !Number.isFinite(debt) || debt < 0 || !Number.isFinite(collateral) || collateral < 0) {
    return { safeLtv, required: null, repay: 0, shortfall: null, remainingDebt: debt, withdrawable: 0, postRepayLtv: null };
  }
  const required = Math.max(0, debt - collateral * price * safeLtv);
  const repay = Math.min(required, available, debt);
  const remainingDebt = Math.max(0, debt - repay);
  const withdrawable = Math.max(0, collateral - remainingDebt / (price * safeLtv));
  return { safeLtv, required, repay, shortfall: Math.max(0, required - available), remainingDebt, withdrawable,
    postRepayLtv: collateral > 0 ? remainingDebt / (collateral * price) : remainingDebt > 0 ? null : 0 };
}

export interface SupplyPosition { stableUsdc: number; nativeQty: number; cashUsdc: number }

/** Use current price, not initial borrowed fiat, when dissolving native supply. */
export function dissolvedValue(position: SupplyPosition, price: number | undefined): number | null {
  if (position.nativeQty > 0 && (!price || !Number.isFinite(price) || price <= 0)) return null;
  return position.stableUsdc + position.cashUsdc + position.nativeQty * (price ?? 0);
}
