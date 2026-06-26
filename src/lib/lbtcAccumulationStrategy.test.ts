import { describe, expect, it } from 'vitest';
import {
  buildLbtcAccumulationPlan,
  computeAvailableBorrowingPowerUsd,
  computeLbtcAllocationPct,
  computePortfolioLtvPct,
  isLbtcAccumulationEligible,
  selectLbtcDexRoute,
} from '@/lib/lbtcAccumulationStrategy';

describe('lbtcAccumulationStrategy', () => {
  it('enables accumulation at temperament >= 40', () => {
    expect(isLbtcAccumulationEligible(39)).toBe(false);
    expect(isLbtcAccumulationEligible(40)).toBe(true);
    expect(isLbtcAccumulationEligible(75)).toBe(true);
  });

  it('scales allocation from 10% to 20%', () => {
    expect(computeLbtcAllocationPct(40)).toBe(10);
    expect(computeLbtcAllocationPct(100)).toBe(20);
    expect(computeLbtcAllocationPct(70)).toBe(15);
  });

  it('computes borrowing power from max LTV headroom', () => {
    expect(computeAvailableBorrowingPowerUsd(10_000, 2_000, 33)).toBe(1300);
    expect(computeAvailableBorrowingPowerUsd(10_000, 3_300, 33)).toBe(0);
  });

  it('computes portfolio LTV', () => {
    expect(computePortfolioLtvPct(3_000, 10_000)).toBe(30);
  });

  it('prefers Curve for larger swaps', () => {
    expect(selectLbtcDexRoute(600).id).toBe('curve');
    expect(selectLbtcDexRoute(200).id).toBe('uniswap-v3');
  });

  it('blocks when temperament is conservative', () => {
    const plan = buildLbtcAccumulationPlan({
      temperamentPct: 25,
      collateralUsd: 10_000,
      currentDebtUsd: 0,
      proposedBorrowUsd: 3_000,
      maxLtvPct: 33,
      btcPrice: 95_000,
    });
    expect(plan.enabled).toBe(false);
    expect(plan.blocked).toBe(true);
  });

  it('builds accumulation plan with LTV safety', () => {
    const plan = buildLbtcAccumulationPlan({
      temperamentPct: 50,
      collateralUsd: 10_000,
      currentDebtUsd: 0,
      proposedBorrowUsd: 3_000,
      maxLtvPct: 33,
      btcPrice: 95_000,
    });
    expect(plan.enabled).toBe(true);
    expect(plan.blocked).toBe(false);
    expect(plan.targetUsd).toBe(351);
    expect(plan.allocationPct).toBe(11.7);
    expect(plan.projectedLtvPct).toBeLessThanOrEqual(33);
    expect(plan.lbtcQty).toBeGreaterThan(0);
  });

  it('blocks when max LTV already reached', () => {
    const plan = buildLbtcAccumulationPlan({
      temperamentPct: 50,
      collateralUsd: 10_000,
      currentDebtUsd: 3_300,
      proposedBorrowUsd: 500,
      maxLtvPct: 33,
      btcPrice: 95_000,
    });
    expect(plan.blocked).toBe(true);
    expect(plan.targetUsd).toBe(0);
  });
});
