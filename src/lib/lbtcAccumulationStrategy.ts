import { computeProjectedLbtcQty } from '@/lib/cyborgTerminalEngine';

export const LBTC_ACCUMULATION_MIN_TEMPERAMENT = 40;
export const LBTC_ALLOCATION_MIN_PCT = 10;
export const LBTC_ALLOCATION_MAX_PCT = 20;

export const UNISWAP_V3_LBTC_USDC_URL =
  'https://app.uniswap.org/swap?chain=arbitrum&inputCurrency=USDC&outputCurrency=0x93919784C523F39CACaa98EeC0A3E7aeeC4470c5';
export const CURVE_LBTC_USDC_URL = 'https://curve.fi/#/arbitrum/pools/factory-stable-ng-34/swap';

export type LbtcDexId = 'uniswap-v3' | 'curve';

export interface LbtcDexRoute {
  id: LbtcDexId;
  name: string;
  poolLabel: string;
  url: string;
  reasonSk: string;
  reasonEn: string;
}

export interface LbtcAccumulationPlan {
  enabled: boolean;
  blocked: boolean;
  blockReasonSk?: string;
  blockReasonEn?: string;
  allocationPct: number;
  availableBorrowingPowerUsd: number;
  totalBorrowUsd: number;
  targetUsd: number;
  lbtcQty: number;
  stableReserveUsd: number;
  currentLtvPct: number;
  projectedLtvPct: number;
  dex: LbtcDexRoute;
  planLineSk: string;
  planLineEn: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isLbtcAccumulationEligible(temperamentPct: number | null | undefined): boolean {
  return (temperamentPct ?? 0) >= LBTC_ACCUMULATION_MIN_TEMPERAMENT;
}

/** 10 % at temperament 40 → 20 % at temperament 100. */
export function computeLbtcAllocationPct(temperamentPct: number | null | undefined): number {
  if (!isLbtcAccumulationEligible(temperamentPct)) return 0;
  const t = clamp(temperamentPct ?? 0, LBTC_ACCUMULATION_MIN_TEMPERAMENT, 100);
  const ratio = (t - LBTC_ACCUMULATION_MIN_TEMPERAMENT) / (100 - LBTC_ACCUMULATION_MIN_TEMPERAMENT);
  return Math.round((LBTC_ALLOCATION_MIN_PCT + ratio * (LBTC_ALLOCATION_MAX_PCT - LBTC_ALLOCATION_MIN_PCT)) * 10) / 10;
}

export function computePortfolioLtvPct(debtUsd: number, collateralUsd: number): number {
  const debt = Math.max(0, debtUsd ?? 0);
  const collateral = Math.max(0, collateralUsd ?? 0);
  if (collateral <= 0 || debt <= 0) return 0;
  return Math.round((debt / collateral) * 1000) / 10;
}

/** Remaining USDC borrow room before hitting max LTV cap. */
export function computeAvailableBorrowingPowerUsd(
  collateralUsd: number,
  currentDebtUsd: number,
  maxLtvPct: number,
): number {
  const collateral = Math.max(0, collateralUsd ?? 0);
  const debt = Math.max(0, currentDebtUsd ?? 0);
  const maxLtv = Math.max(0, maxLtvPct ?? 0);
  const capUsd = collateral * (maxLtv / 100);
  return Math.max(0, roundUsd(capUsd - debt));
}

export function selectLbtcDexRoute(usdcAmountUsd: number): LbtcDexRoute {
  if ((usdcAmountUsd ?? 0) >= 500) {
    return {
      id: 'curve',
      name: 'Curve',
      poolLabel: 'Curve LBTC/USDC (Arbitrum)',
      url: CURVE_LBTC_USDC_URL,
      reasonSk: 'Curve — nižší slippage pri väčších LBTC/USDC swapoch na Arbitrum.',
      reasonEn: 'Curve — lower slippage for larger LBTC/USDC swaps on Arbitrum.',
    };
  }
  return {
    id: 'uniswap-v3',
    name: 'Uniswap V3',
    poolLabel: 'Uniswap V3 LBTC/USDC 0.05 %',
    url: UNISWAP_V3_LBTC_USDC_URL,
    reasonSk: 'Uniswap V3 — hlboká likvidita pre menšie LBTC akumulačné nákupy.',
    reasonEn: 'Uniswap V3 — deep liquidity for smaller LBTC accumulation buys.',
  };
}

function emptyPlan(dex: LbtcDexRoute): LbtcAccumulationPlan {
  return {
    enabled: false,
    blocked: true,
    allocationPct: 0,
    availableBorrowingPowerUsd: 0,
    totalBorrowUsd: 0,
    targetUsd: 0,
    lbtcQty: 0,
    stableReserveUsd: 0,
    currentLtvPct: 0,
    projectedLtvPct: 0,
    dex,
    planLineSk: '',
    planLineEn: '',
  };
}

export function buildLbtcAccumulationPlan(input: {
  temperamentPct: number;
  collateralUsd: number;
  currentDebtUsd: number;
  proposedBorrowUsd: number;
  maxLtvPct: number;
  btcPrice: number;
}): LbtcAccumulationPlan {
  const dex = selectLbtcDexRoute(input.proposedBorrowUsd ?? 0);
  const collateralUsd = Math.max(0, input.collateralUsd ?? 0);
  const currentDebtUsd = Math.max(0, input.currentDebtUsd ?? 0);
  const maxLtvPct = Math.max(0, input.maxLtvPct ?? 33);
  const btcPrice = Math.max(0, input.btcPrice ?? 0);
  const currentLtvPct = computePortfolioLtvPct(currentDebtUsd, collateralUsd);

  if (!isLbtcAccumulationEligible(input.temperamentPct)) {
    return {
      ...emptyPlan(dex),
      blockReasonSk: 'LBTC akumulácia je aktívna len pri vyváženom alebo agresívnom temperamente (≥ 40 %).',
      blockReasonEn: 'LBTC accumulation is active only with balanced or aggressive temperament (≥ 40 %).',
    };
  }

  if (collateralUsd <= 0) {
    return {
      ...emptyPlan(dex),
      enabled: true,
      blocked: true,
      blockReasonSk: 'Chýba taktický kolaterál — najprv vložte kolaterál do Vrstvy 3.',
      blockReasonEn: 'No tactical collateral — deposit Layer 3 collateral first.',
    };
  }

  const availableBorrowingPowerUsd = computeAvailableBorrowingPowerUsd(
    collateralUsd,
    currentDebtUsd,
    maxLtvPct,
  );

  const cappedBorrowUsd = roundUsd(Math.min(
    Math.max(0, input.proposedBorrowUsd ?? 0),
    availableBorrowingPowerUsd,
  ));

  if (cappedBorrowUsd <= 0) {
    return {
      ...emptyPlan(dex),
      enabled: true,
      blocked: true,
      currentLtvPct,
      projectedLtvPct: currentLtvPct,
      availableBorrowingPowerUsd,
      blockReasonSk: `LTV limit ${maxLtvPct} % dosiahnutý — nákup LBTC zablokovaný.`,
      blockReasonEn: `LTV cap ${maxLtvPct} % reached — LBTC purchase blocked.`,
    };
  }

  const allocationPct = computeLbtcAllocationPct(input.temperamentPct);
  let targetUsd = roundUsd(cappedBorrowUsd * (allocationPct / 100));
  let totalBorrowUsd = cappedBorrowUsd;
  let projectedLtvPct = computePortfolioLtvPct(currentDebtUsd + totalBorrowUsd, collateralUsd);

  if (projectedLtvPct > maxLtvPct) {
    const maxTotalDebt = collateralUsd * (maxLtvPct / 100);
    totalBorrowUsd = roundUsd(Math.max(0, maxTotalDebt - currentDebtUsd));
    targetUsd = roundUsd(totalBorrowUsd * (allocationPct / 100));
    projectedLtvPct = computePortfolioLtvPct(currentDebtUsd + totalBorrowUsd, collateralUsd);
  }

  if (targetUsd <= 0 || projectedLtvPct > maxLtvPct) {
    return {
      ...emptyPlan(dex),
      enabled: true,
      blocked: true,
      allocationPct,
      availableBorrowingPowerUsd,
      totalBorrowUsd,
      currentLtvPct,
      projectedLtvPct,
      blockReasonSk: 'Nákup LBTC by prekročil max LTV — objem automaticky znížený na 0.',
      blockReasonEn: 'LBTC purchase would exceed max LTV — volume reduced to 0.',
    };
  }

  const lbtcQty = computeProjectedLbtcQty(targetUsd, btcPrice);
  const stableReserveUsd = roundUsd(totalBorrowUsd - targetUsd);
  const dexForSize = selectLbtcDexRoute(targetUsd);

  const planLineSk = [
    `LBTC akumulácia: ${targetUsd.toFixed(2)} USD (${allocationPct.toFixed(1)} % z úveru).`,
    `DEX: ${dexForSize.poolLabel}.`,
    `Rezerva v USDC: ${stableReserveUsd.toFixed(2)} USD.`,
    `Projektované LTV: ${projectedLtvPct.toFixed(1)} % (max ${maxLtvPct} %).`,
  ].join('\n');

  const planLineEn = [
    `LBTC accumulation: ${targetUsd.toFixed(2)} USD (${allocationPct.toFixed(1)} % of borrow).`,
    `DEX: ${dexForSize.poolLabel}.`,
    `USDC reserve: ${stableReserveUsd.toFixed(2)} USD.`,
    `Projected LTV: ${projectedLtvPct.toFixed(1)} % (max ${maxLtvPct} %).`,
  ].join('\n');

  return {
    enabled: true,
    blocked: false,
    allocationPct,
    availableBorrowingPowerUsd,
    totalBorrowUsd,
    targetUsd,
    lbtcQty,
    stableReserveUsd,
    currentLtvPct,
    projectedLtvPct,
    dex: dexForSize,
    planLineSk,
    planLineEn,
  };
}

export function formatLbtcAccumulationPlanLine(plan: LbtcAccumulationPlan, sk: boolean): string {
  if (!plan.enabled) return '';
  return sk ? plan.planLineSk : plan.planLineEn;
}
