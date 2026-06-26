import {
  isLtvNearMaxCap,
  resolveYieldVaultRoute,
  type YieldVaultRoute,
} from '@/lib/borrowedUsdcCapitalSplit';
import {
  computeAvailableBorrowingPowerUsd,
  computePortfolioLtvPct,
} from '@/lib/lbtcAccumulationStrategy';

export type YieldEngineStrategy = 'auto_staking' | 'stable_swap' | 'hold_cash';

export interface StableSwapOption {
  token: 'sDAI' | 'sUSDe';
  apyPct: number;
  url: string;
  reasonSk: string;
  reasonEn: string;
}

export interface YieldEnginePlan {
  enabled: boolean;
  blocked: boolean;
  negativeCarry: boolean;
  recommendedStrategy: YieldEngineStrategy;
  borrowedUsdcUsd: number;
  deployUsd: number;
  borrowApyPct: number;
  bestYieldApyPct: number;
  autoStaking: YieldVaultRoute & { apyPct: number };
  stableSwap: StableSwapOption;
  holdCash: { reasonSk: string; reasonEn: string };
  blockReasonSk?: string;
  blockReasonEn?: string;
  planLineSk: string;
  planLineEn: string;
}

const SDAI_ARB_URL = 'https://app.balancer.fi/#/arbitrum';
const SUSDE_ARB_URL = 'https://app.ethena.fi';

const FALLBACK_USDC_SUPPLY_APY = 4.2;
const FALLBACK_SDAI_APY = 5.1;
const FALLBACK_SUSDE_APY = 5.8;

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isNegativeCarry(borrowApyPct: number, yieldApyPct: number): boolean {
  return (borrowApyPct ?? 0) > (yieldApyPct ?? 0);
}

export function resolveYieldEngineStrategy(input: {
  volatilityHigh: boolean;
  borrowApyPct: number;
  usdcSupplyApyPct: number;
  sDaiApyPct?: number;
  sUsdeApyPct?: number;
}): YieldEngineStrategy {
  if (input.volatilityHigh) return 'hold_cash';

  const usdcApy = input.usdcSupplyApyPct ?? FALLBACK_USDC_SUPPLY_APY;
  const sDaiApy = input.sDaiApyPct ?? FALLBACK_SDAI_APY;
  const sUsdeApy = input.sUsdeApyPct ?? FALLBACK_SUSDE_APY;
  const bestStableApy = Math.max(sDaiApy, sUsdeApy);

  if (isNegativeCarry(input.borrowApyPct, Math.max(usdcApy, bestStableApy))) {
    return 'hold_cash';
  }

  if (bestStableApy > usdcApy + 0.5) {
    return 'stable_swap';
  }

  return 'auto_staking';
}

export function buildYieldEnginePlan(input: {
  usdcDebtUsd: number;
  proposedBorrowUsd: number;
  collateralUsd: number;
  maxLtvPct: number;
  borrowApyPct: number;
  usdcSupplyApyPct?: number;
  volatilityHigh: boolean;
  supplyOnlyMode: boolean;
  yieldVaultProtocol?: string | null;
  yieldVaultLabel?: string | null;
  yieldVaultUrl?: string | null;
}): YieldEnginePlan {
  const autoStakingBase = resolveYieldVaultRoute({
    protocol: input.yieldVaultProtocol,
    venueLabel: input.yieldVaultLabel,
    url: input.yieldVaultUrl,
  });
  const usdcSupplyApy = input.usdcSupplyApyPct ?? FALLBACK_USDC_SUPPLY_APY;
  const sDaiApy = FALLBACK_SDAI_APY;
  const sUsdeApy = FALLBACK_SUSDE_APY;
  const stableSwapToken: 'sDAI' | 'sUSDe' = sUsdeApy >= sDaiApy ? 'sUSDe' : 'sDAI';
  const stableSwapApy = Math.max(sDaiApy, sUsdeApy);

  const empty: YieldEnginePlan = {
    enabled: false,
    blocked: true,
    negativeCarry: false,
    recommendedStrategy: 'hold_cash',
    borrowedUsdcUsd: 0,
    deployUsd: 0,
    borrowApyPct: input.borrowApyPct ?? 0,
    bestYieldApyPct: 0,
    autoStaking: { ...autoStakingBase, apyPct: usdcSupplyApy },
    stableSwap: {
      token: stableSwapToken,
      apyPct: stableSwapApy,
      url: stableSwapToken === 'sUSDe' ? SUSDE_ARB_URL : SDAI_ARB_URL,
      reasonSk: `Výnosnejší stablecoin ${stableSwapToken} na Arbitrum.`,
      reasonEn: `Higher-yield stablecoin ${stableSwapToken} on Arbitrum.`,
    },
    holdCash: {
      reasonSk: 'USDC v hotovosti — bez ďalšieho protokolového rizika.',
      reasonEn: 'USDC in cash — no additional protocol risk.',
    },
    planLineSk: '',
    planLineEn: '',
  };

  if (input.supplyOnlyMode) {
    return {
      ...empty,
      blockReasonSk: 'Supply Only Mode — Yield Engine je neaktívny (bez borrow).',
      blockReasonEn: 'Supply Only Mode — Yield Engine inactive (no borrow).',
    };
  }

  const collateralUsd = Math.max(0, input.collateralUsd ?? 0);
  const debt = Math.max(0, input.usdcDebtUsd ?? 0);
  const headroom = computeAvailableBorrowingPowerUsd(collateralUsd, debt, input.maxLtvPct ?? 33);
  const proposed = roundUsd(Math.min(Math.max(0, input.proposedBorrowUsd ?? 0), headroom));
  const borrowedUsdcUsd = roundUsd(Math.max(debt, proposed));

  if (borrowedUsdcUsd <= 0) {
    return {
      ...empty,
      blockReasonSk: 'Yield Engine sa aktivuje po vypožičaní USDC.',
      blockReasonEn: 'Yield Engine activates after borrowing USDC.',
    };
  }

  const recommendedStrategy = resolveYieldEngineStrategy({
    volatilityHigh: input.volatilityHigh,
    borrowApyPct: input.borrowApyPct ?? 0,
    usdcSupplyApyPct: usdcSupplyApy,
    sDaiApyPct: sDaiApy,
    sUsdeApyPct: sUsdeApy,
  });

  const projectedLtv = computePortfolioLtvPct(debt + proposed, collateralUsd);
  const nearMax = isLtvNearMaxCap(
    computePortfolioLtvPct(debt, collateralUsd),
    projectedLtv,
    input.maxLtvPct ?? 33,
  );

  if (nearMax) {
    return {
      ...empty,
      enabled: true,
      blocked: false,
      negativeCarry: isNegativeCarry(input.borrowApyPct ?? 0, usdcSupplyApy),
      recommendedStrategy: 'hold_cash',
      borrowedUsdcUsd,
      deployUsd: borrowedUsdcUsd,
      bestYieldApyPct: 0,
      planLineSk: `Yield Engine: Hold/Cash — LTV blízko limitu (${borrowedUsdcUsd.toFixed(2)} USDC).`,
      planLineEn: `Yield Engine: Hold/Cash — LTV near cap (${borrowedUsdcUsd.toFixed(2)} USDC).`,
    };
  }

  const negativeCarry = isNegativeCarry(input.borrowApyPct ?? 0, Math.max(usdcSupplyApy, stableSwapApy));
  const strategy = negativeCarry ? 'hold_cash' : recommendedStrategy;
  const bestYieldApyPct = strategy === 'stable_swap'
    ? stableSwapApy
    : strategy === 'auto_staking'
      ? usdcSupplyApy
      : 0;

  const planLineSk = [
    `Yield Engine · ${borrowedUsdcUsd.toFixed(2)} USDC`,
    negativeCarry ? 'Negatívny carry — odporúčané držať hotovosť alebo splatiť dlh.' : '',
    strategy === 'auto_staking'
      ? `Auto-Staking: ${autoStakingBase.venueLabel} (${usdcSupplyApy.toFixed(2)} % APY)`
      : strategy === 'stable_swap'
        ? `Stable Swap: USDC → ${stableSwapToken} (${stableSwapApy.toFixed(2)} % APY)`
        : 'Hold/Cash: ponechať USDC v rezerve',
  ].filter(Boolean).join('\n');

  const planLineEn = [
    `Yield Engine · ${borrowedUsdcUsd.toFixed(2)} USDC`,
    negativeCarry ? 'Negative carry — prefer cash hold or debt repayment.' : '',
    strategy === 'auto_staking'
      ? `Auto-Staking: ${autoStakingBase.venueLabel} (${usdcSupplyApy.toFixed(2)}% APY)`
      : strategy === 'stable_swap'
        ? `Stable Swap: USDC → ${stableSwapToken} (${stableSwapApy.toFixed(2)}% APY)`
        : 'Hold/Cash: keep USDC reserve',
  ].filter(Boolean).join('\n');

  return {
    enabled: true,
    blocked: false,
    negativeCarry,
    recommendedStrategy: strategy,
    borrowedUsdcUsd,
    deployUsd: borrowedUsdcUsd,
    borrowApyPct: input.borrowApyPct ?? 0,
    bestYieldApyPct,
    autoStaking: { ...autoStakingBase, apyPct: usdcSupplyApy },
    stableSwap: {
      token: stableSwapToken,
      apyPct: stableSwapApy,
      url: stableSwapToken === 'sUSDe' ? SUSDE_ARB_URL : SDAI_ARB_URL,
      reasonSk: `Konverzia USDC → ${stableSwapToken} na Arbitrum.`,
      reasonEn: `Convert USDC → ${stableSwapToken} on Arbitrum.`,
    },
    holdCash: {
      reasonSk: input.volatilityHigh
        ? 'Vysoká volatilita — USDC držte v hotovosti.'
        : 'Hotovostná rezerva pre flexibilitu a splátku dlhu.',
      reasonEn: input.volatilityHigh
        ? 'High volatility — keep USDC in cash.'
        : 'Cash reserve for flexibility and debt repayment.',
    },
    planLineSk,
    planLineEn,
  };
}

export function formatYieldEnginePlanLine(plan: YieldEnginePlan, sk: boolean): string {
  if (!plan.enabled) return '';
  return sk ? plan.planLineSk : plan.planLineEn;
}
