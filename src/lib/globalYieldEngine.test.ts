import { describe, expect, it } from 'vitest';
import { buildGlobalYieldEnginePlan } from '@/lib/globalYieldEngine';

describe('globalYieldEngine', () => {
  it('aggregates borrow across ETH and SOL networks', () => {
    const plan = buildGlobalYieldEnginePlan({
      ethBorrowUsdc: 400,
      solBorrowUsdc: 200,
      usdcDebtUsd: 0,
      totalCollateralUsd: 20_000,
      maxLtvPct: 33,
      borrowApyPct: 4.5,
      volatilityHigh: false,
      supplyOnlyMode: false,
    });

    expect(plan.enabled).toBe(true);
    expect(plan.totalBorrowedUsdcUsd).toBe(600);
    expect(plan.breakdown).toHaveLength(2);
    expect(plan.breakdown[0]?.network).toBe('ETH');
    expect(plan.breakdown[1]?.network).toBe('SOL');
    expect(plan.unifiedRecommendationSk).toContain('Jednotné odporúčanie');
  });

  it('uses actual debt when higher than projected borrow', () => {
    const plan = buildGlobalYieldEnginePlan({
      ethBorrowUsdc: 300,
      solBorrowUsdc: 100,
      usdcDebtUsd: 750,
      totalCollateralUsd: 15_000,
      maxLtvPct: 33,
      borrowApyPct: 5,
      volatilityHigh: false,
      supplyOnlyMode: false,
    });

    expect(plan.totalBorrowedUsdcUsd).toBe(750);
  });

  it('disables in supply only mode', () => {
    const plan = buildGlobalYieldEnginePlan({
      ethBorrowUsdc: 500,
      solBorrowUsdc: 0,
      usdcDebtUsd: 500,
      totalCollateralUsd: 10_000,
      maxLtvPct: 33,
      borrowApyPct: 4,
      volatilityHigh: false,
      supplyOnlyMode: true,
    });

    expect(plan.enabled).toBe(false);
    expect(plan.blockReasonSk).toContain('Supply Only Mode');
  });
});
