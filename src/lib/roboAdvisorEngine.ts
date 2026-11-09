export interface RoboInputs {
  totalBtc: number;
  currentDepositedWbtc: number; // BTC
  currentDebt: number; // USD
  weeklyBudget: number; // USD
  fearAndGreed: number; // 0-100
  borrowApy: number; // %
  btcPrice: number; // USD
  /** Optional 24h BTC change in % — crash detector. */
  priceChange24h?: number;
  /** Asset-specific risk profile (defaults = BTC). */
  hardcapPct?: number;
  ltvMax?: number; // target LTV at F&G 0
  ltvMin?: number; // target LTV at F&G 100
  /** Fixed Layer 5 pillar split (stable / native / cash); default = F&G-driven BTC split. */
  pillars?: { stable: number; native: number; cash: number };
  /** Auto-Repay trigger LTV (Layer 4). */
  autoRepayTrigger?: number;
  /** F&G multiplier ceiling at F&G 0 (BTC 3.5×, ETH 4.5×). */
  fgMaxMultiplier?: number;
}

/** ETH profile: 25 % hardcap, LTV curve 21 % → 15 % (18 % at neutral F&G 50), Auto-Repay 25 % → 18 %, pillars 29/60/11. */
export const BTC_FG_MAX_MULTIPLIER = 3.5;
export const ETH_FG_MAX_MULTIPLIER = 4.5;
/** ETH target LTV: 0.21 − (fg/100)·0.06. */
export const targetLtvEth = (fg: number) => 0.21 - (Math.max(0, Math.min(100, fg)) / 100) * 0.06;
export const ETH_ROBO = { fgMaxMultiplier: ETH_FG_MAX_MULTIPLIER, hardcapPct: 0.25, ltvMax: 0.21, ltvMin: 0.15, autoRepayTrigger: 0.25, pillars: { stable: 0.29, native: 0.60, cash: 0.11 } } as const;

/** Autonomous horizon (weeks) driven by live F&G; Infinity = paused. */
export function dynamicHorizonWeeks(fg: number): number {
  const f = Math.max(0, Math.min(100, fg));
  return Math.round(13 + (f / 100) * 39);
}

/** Asymmetric continuous F&G multiplier: max× at F&G 0 → 0× at F&G 100 (BTC 3.5, ETH 4.5). */
export function fgMultiplier(fg: number, max = BTC_FG_MAX_MULTIPLIER): number {
  return Math.max(0, max * (1 - fg / 100));
}

/** Safety circuit breaker: borrow APY > 8 %, extreme panic (F&G ≤ 10) or a 24h crash ≤ −10 %. */
export function circuitBreaker(fg: number, borrowApy: number, change24h?: number) {
  const reasons: string[] = [];
  if (borrowApy > 8) reasons.push(`Borrow APY ${borrowApy.toFixed(2)} % > 8 %`);
  if (fg <= 10) reasons.push(`Extrémna panika (F&G ${fg})`);
  if (change24h != null && change24h <= -10) reasons.push(`Crash ${change24h.toFixed(1)} % za 24h`);
  return { active: reasons.length > 0, reasons };
}

export type RoboState = 'A' | 'B' | 'C' | 'D' | 'E';

export function computeRoboAction(i: RoboInputs) {
  const maxCollateral = i.totalBtc * (i.hardcapPct ?? 0.25);
  const availableSpace = maxCollateral - i.currentDepositedWbtc;
  const isHardcapReached = availableSpace <= 0;

  const remainingSpaceBtc = Math.max(0, availableSpace);
  const horizonWeeks = dynamicHorizonWeeks(i.fearAndGreed);
  const paused = false; // continuous curve — never a rigid pause
  const baseWeeklyUsd = paused ? 0 : (remainingSpaceBtc / horizonWeeks) * i.btcPrice;
  const multiplier = fgMultiplier(i.fearAndGreed, i.fgMaxMultiplier ?? BTC_FG_MAX_MULTIPLIER);
  const weeklyBudgetUsd = baseWeeklyUsd * multiplier;
  const maxDefiPool = maxCollateral;
  // Horizon DCA: fiat budget → exact BTC, never above the remaining 25 % space.
  const weeklyDepositBtc = i.btcPrice > 0 ? Math.min(remainingSpaceBtc, weeklyBudgetUsd / i.btcPrice) : 0;
  const collateralRatio = maxDefiPool > 0 ? weeklyDepositBtc / maxDefiPool : 0;
  const targetCollateralBtc = i.currentDepositedWbtc + weeklyDepositBtc;
  const depositToCollateral = weeklyDepositBtc * i.btcPrice;
  const remainingFiat = Math.max(0, i.weeklyBudget - depositToCollateral);
  const breaker = circuitBreaker(i.fearAndGreed, i.borrowApy, i.priceChange24h);

  const hi = i.ltvMax ?? 0.30, lo = i.ltvMin ?? 0.15;
  const targetLtv = hi - (Math.max(0, Math.min(100, i.fearAndGreed)) / 100) * (hi - lo);
  // Units unified to USD: collateral BTC is valued at the live price.
  const collateralUsd = i.currentDepositedWbtc * i.btcPrice + depositToCollateral;
  const rawDelta = collateralUsd * targetLtv - i.currentDebt;
  // Breaker suspends any new borrowing; repayment stays allowed.
  const borrowDelta = breaker.active ? Math.min(0, rawDelta) : rawDelta;

  const cashRatio = i.pillars?.cash ?? 0;
  const cbBtcRatio = i.pillars ? i.pillars.native : 1 - i.fearAndGreed / 100;
  const usdcSupplyRatio = i.pillars ? i.pillars.stable : 1 - cbBtcRatio;
  // Layer 4 Auto-Repay: once live LTV ≥ trigger, repay exactly back to target LTV.
  const existingCollateralUsd = i.currentDepositedWbtc * i.btcPrice;
  const liveLtv = existingCollateralUsd > 0 ? i.currentDebt / existingCollateralUsd : 0;
  const autoRepayTrigger = i.autoRepayTrigger ?? 0.30;
  const autoRepayUsd = liveLtv >= autoRepayTrigger ? Math.max(0, i.currentDebt - existingCollateralUsd * targetLtv) : 0;

  let state: RoboState;
  if (isHardcapReached) state = 'A';
  else if (breaker.active) state = 'B';
  else if (borrowDelta <= 0) state = 'C';
  else if (borrowDelta < 50) state = 'D';
  else state = 'E';

  const repayAmount = Math.min(remainingFiat, Math.abs(Math.min(0, borrowDelta)));
  const coldStorage = remainingFiat - repayAmount;

  return {
    maxCollateral, maxDefiPool, targetCollateralBtc, weeklyDepositBtc, availableSpace, isHardcapReached, collateralRatio, depositToCollateral,
    remainingFiat, targetLtv, borrowDelta, cbBtcRatio, usdcSupplyRatio, cashRatio, liveLtv, autoRepayTrigger, autoRepayUsd, state,
    repayAmount, coldStorage, collateralUsd,
    remainingSpaceBtc, horizonWeeks, paused, baseWeeklyUsd, multiplier, weeklyBudgetUsd, breaker,
  };
}
