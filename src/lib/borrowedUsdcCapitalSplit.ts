import { computeProjectedLbtcQty } from '@/lib/cyborgTerminalEngine';
import {
  computeAvailableBorrowingPowerUsd,
  computePortfolioLtvPct,
  selectLbtcDexRoute,
  type LbtcDexRoute,
} from '@/lib/lbtcAccumulationStrategy';

export const SPLIT_MIN_TEMPERAMENT = 40;
export const RESERVE_BASE_PCT = 30;
export const YIELD_BASE_PCT = 40;
export const GROWTH_BASE_PCT = 30;
export const RESERVE_MIN_PCT = 20;
export const LTV_NEAR_MAX_BUFFER_PCT = 3;

export interface UsdcSplitRatios {
  reservePct: number;
  yieldPct: number;
  growthPct: number;
}

export interface YieldVaultRoute {
  protocol: string;
  venueLabel: string;
  url: string;
}

export interface BorrowedUsdcSplitPlan {
  enabled: boolean;
  blocked: boolean;
  safetyMode: boolean;
  blockReasonSk?: string;
  blockReasonEn?: string;
  ratios: UsdcSplitRatios;
  totalBorrowUsd: number;
  reserveUsd: number;
  yieldUsd: number;
  growthUsd: number;
  lbtcQty: number;
  availableBorrowingPowerUsd: number;
  currentLtvPct: number;
  projectedLtvPct: number;
  yieldVault: YieldVaultRoute;
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

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isCapitalSplitEligible(temperamentPct: number | null | undefined): boolean {
  return (temperamentPct ?? 0) >= SPLIT_MIN_TEMPERAMENT;
}

/**
 * Temperament shifts weight from reserve → growth while keeping reserve ≥ 20 %.
 * Base at 40 %: 30 / 40 / 30. At 100 %: 20 / 40 / 40.
 */
export function computeUsdcSplitRatios(temperamentPct: number | null | undefined): UsdcSplitRatios {
  if (!isCapitalSplitEligible(temperamentPct)) {
    return { reservePct: 100, yieldPct: 0, growthPct: 0 };
  }
  const t = clamp(temperamentPct ?? 40, SPLIT_MIN_TEMPERAMENT, 100);
  const ratio = (t - SPLIT_MIN_TEMPERAMENT) / (100 - SPLIT_MIN_TEMPERAMENT);
  const reservePct = roundPct(RESERVE_BASE_PCT - ratio * (RESERVE_BASE_PCT - RESERVE_MIN_PCT));
  const growthPct = roundPct(GROWTH_BASE_PCT + ratio * (GROWTH_BASE_PCT - RESERVE_MIN_PCT));
  const yieldPct = roundPct(100 - reservePct - growthPct);
  return { reservePct, yieldPct, growthPct };
}

export function isLtvNearMaxCap(
  currentLtvPct: number,
  projectedLtvPct: number,
  maxLtvPct: number,
  bufferPct = LTV_NEAR_MAX_BUFFER_PCT,
): boolean {
  const threshold = Math.max(0, (maxLtvPct ?? 33) - bufferPct);
  return (currentLtvPct ?? 0) >= threshold || (projectedLtvPct ?? 0) >= threshold;
}

export function resolveYieldVaultRoute(input: {
  protocol?: string | null;
  venueLabel?: string | null;
  url?: string | null;
}): YieldVaultRoute {
  const protocol = input.protocol?.trim() || 'Morpho';
  return {
    protocol,
    venueLabel: input.venueLabel?.trim() || `${protocol} USDC Vault (Arbitrum)`,
    url: input.url?.trim() || 'https://app.morpho.org/arbitrum',
  };
}

function splitAmounts(totalUsd: number, ratios: UsdcSplitRatios): {
  reserveUsd: number;
  yieldUsd: number;
  growthUsd: number;
} {
  const total = Math.max(0, totalUsd);
  const reserveUsd = roundUsd(total * (ratios.reservePct / 100));
  const yieldUsd = roundUsd(total * (ratios.yieldPct / 100));
  const growthUsd = roundUsd(Math.max(0, total - reserveUsd - yieldUsd));
  return { reserveUsd, yieldUsd, growthUsd };
}

function emptySplitPlan(yieldVault: YieldVaultRoute, dex: LbtcDexRoute): BorrowedUsdcSplitPlan {
  return {
    enabled: false,
    blocked: true,
    safetyMode: false,
    ratios: { reservePct: 0, yieldPct: 0, growthPct: 0 },
    totalBorrowUsd: 0,
    reserveUsd: 0,
    yieldUsd: 0,
    growthUsd: 0,
    lbtcQty: 0,
    availableBorrowingPowerUsd: 0,
    currentLtvPct: 0,
    projectedLtvPct: 0,
    yieldVault,
    dex,
    planLineSk: '',
    planLineEn: '',
  };
}

export function buildBorrowedUsdcSplitPlan(input: {
  temperamentPct: number;
  collateralUsd: number;
  currentDebtUsd: number;
  proposedBorrowUsd: number;
  maxLtvPct: number;
  btcPrice: number;
  yieldVaultProtocol?: string | null;
  yieldVaultLabel?: string | null;
  yieldVaultUrl?: string | null;
}): BorrowedUsdcSplitPlan {
  const yieldVault = resolveYieldVaultRoute({
    protocol: input.yieldVaultProtocol,
    venueLabel: input.yieldVaultLabel,
    url: input.yieldVaultUrl,
  });
  const dex = selectLbtcDexRoute(input.proposedBorrowUsd ?? 0);
  const collateralUsd = Math.max(0, input.collateralUsd ?? 0);
  const currentDebtUsd = Math.max(0, input.currentDebtUsd ?? 0);
  const maxLtvPct = Math.max(0, input.maxLtvPct ?? 33);
  const btcPrice = Math.max(0, input.btcPrice ?? 0);
  const currentLtvPct = computePortfolioLtvPct(currentDebtUsd, collateralUsd);

  if (!isCapitalSplitEligible(input.temperamentPct)) {
    return {
      ...emptySplitPlan(yieldVault, dex),
      blockReasonSk: 'Rozdelenie USDC je aktívne len pri vyváženom alebo agresívnom temperamente (≥ 40 %).',
      blockReasonEn: 'USDC split is active only with balanced or aggressive temperament (≥ 40 %).',
    };
  }

  if (collateralUsd <= 0) {
    return {
      ...emptySplitPlan(yieldVault, dex),
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

  let totalBorrowUsd = roundUsd(Math.min(
    Math.max(0, input.proposedBorrowUsd ?? 0),
    availableBorrowingPowerUsd,
  ));

  let projectedLtvPct = computePortfolioLtvPct(currentDebtUsd + totalBorrowUsd, collateralUsd);

  if (projectedLtvPct > maxLtvPct) {
    const maxTotalDebt = collateralUsd * (maxLtvPct / 100);
    totalBorrowUsd = roundUsd(Math.max(0, maxTotalDebt - currentDebtUsd));
    projectedLtvPct = computePortfolioLtvPct(currentDebtUsd + totalBorrowUsd, collateralUsd);
  }

  if (totalBorrowUsd <= 0) {
    return {
      ...emptySplitPlan(yieldVault, dex),
      enabled: true,
      blocked: true,
      currentLtvPct,
      projectedLtvPct: currentLtvPct,
      availableBorrowingPowerUsd,
      blockReasonSk: `LTV limit ${maxLtvPct} % dosiahnutý — rozdelenie USDC zablokované.`,
      blockReasonEn: `LTV cap ${maxLtvPct} % reached — USDC split blocked.`,
    };
  }

  const nearMax = isLtvNearMaxCap(currentLtvPct, projectedLtvPct, maxLtvPct);
  const ratios = nearMax
    ? { reservePct: 100, yieldPct: 0, growthPct: 0 }
    : computeUsdcSplitRatios(input.temperamentPct);

  const { reserveUsd, yieldUsd, growthUsd } = nearMax
    ? { reserveUsd: totalBorrowUsd, yieldUsd: 0, growthUsd: 0 }
    : splitAmounts(totalBorrowUsd, ratios);

  const lbtcQty = growthUsd > 0 ? computeProjectedLbtcQty(growthUsd, btcPrice) : 0;
  const dexForGrowth = selectLbtcDexRoute(growthUsd);

  const safetyNoteSk = nearMax
    ? 'LTV blízko max limitu — Yield a Rast vynulované, celý úver ide do Rezervy.'
    : '';
  const safetyNoteEn = nearMax
    ? 'LTV near max cap — Yield and Growth zeroed, full borrow kept as Reserve.'
    : '';

  const planLineSk = [
    `Rozdelenie požičaných USDC (${totalBorrowUsd.toFixed(2)} USD):`,
    `Rezerva ${ratios.reservePct.toFixed(1)} % · Výnos ${ratios.yieldPct.toFixed(1)} % · Rast ${ratios.growthPct.toFixed(1)} %`,
    `Rezerva: ${reserveUsd.toFixed(2)} USDC · Vault: ${yieldVault.venueLabel} · LBTC: ${dexForGrowth.poolLabel}`,
    `Projektované LTV: ${projectedLtvPct.toFixed(1)} % (max ${maxLtvPct} %)`,
    safetyNoteSk,
  ].filter(Boolean).join('\n');

  const planLineEn = [
    `Borrowed USDC split (${totalBorrowUsd.toFixed(2)} USD):`,
    `Reserve ${ratios.reservePct.toFixed(1)} % · Yield ${ratios.yieldPct.toFixed(1)} % · Growth ${ratios.growthPct.toFixed(1)} %`,
    `Reserve: ${reserveUsd.toFixed(2)} USDC · Vault: ${yieldVault.venueLabel} · LBTC: ${dexForGrowth.poolLabel}`,
    `Projected LTV: ${projectedLtvPct.toFixed(1)} % (max ${maxLtvPct} %)`,
    safetyNoteEn,
  ].filter(Boolean).join('\n');

  return {
    enabled: true,
    blocked: false,
    safetyMode: nearMax,
    ratios,
    totalBorrowUsd,
    reserveUsd,
    yieldUsd,
    growthUsd,
    lbtcQty,
    availableBorrowingPowerUsd,
    currentLtvPct,
    projectedLtvPct,
    yieldVault,
    dex: dexForGrowth,
    planLineSk,
    planLineEn,
  };
}

export function formatBorrowedUsdcSplitPlanLine(plan: BorrowedUsdcSplitPlan, sk: boolean): string {
  if (!plan.enabled) return '';
  return sk ? plan.planLineSk : plan.planLineEn;
}
