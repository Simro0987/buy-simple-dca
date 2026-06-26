import { describe, expect, it } from 'vitest';
import {
  buildBorrowedUsdcSplitPlan,
  computeUsdcSplitRatios,
  isCapitalSplitEligible,
  isLtvNearMaxCap,
} from '@/lib/borrowedUsdcCapitalSplit';

describe('borrowedUsdcCapitalSplit', () => {
  it('requires temperament >= 40', () => {
    expect(isCapitalSplitEligible(39)).toBe(false);
    expect(isCapitalSplitEligible(40)).toBe(true);
  });

  it('uses base 30/40/30 split at temperament 40', () => {
    const ratios = computeUsdcSplitRatios(40);
    expect(ratios.reservePct).toBe(30);
    expect(ratios.yieldPct).toBe(40);
    expect(ratios.growthPct).toBe(30);
  });

  it('shifts toward growth at aggressive temperament while reserve stays >= 20', () => {
    const ratios = computeUsdcSplitRatios(100);
    expect(ratios.reservePct).toBe(20);
    expect(ratios.growthPct).toBe(40);
    expect(ratios.yieldPct).toBe(40);
  });

  it('conservative temperament keeps 100% reserve', () => {
    const ratios = computeUsdcSplitRatios(25);
    expect(ratios).toEqual({ reservePct: 100, yieldPct: 0, growthPct: 0 });
  });

  it('detects LTV near max cap', () => {
    expect(isLtvNearMaxCap(30, 32, 33)).toBe(true);
    expect(isLtvNearMaxCap(20, 25, 33)).toBe(false);
  });

  it('splits borrowed USDC into reserve, yield, and growth', () => {
    const plan = buildBorrowedUsdcSplitPlan({
      temperamentPct: 50,
      collateralUsd: 10_000,
      currentDebtUsd: 0,
      proposedBorrowUsd: 1_000,
      maxLtvPct: 33,
      btcPrice: 95_000,
      yieldVaultProtocol: 'Morpho',
      yieldVaultLabel: 'Gauntlet USDC Vault',
    });
    expect(plan.enabled).toBe(true);
    expect(plan.blocked).toBe(false);
    expect(plan.reserveUsd).toBe(283);
    expect(plan.yieldUsd).toBe(400);
    expect(plan.growthUsd).toBe(317);
    expect(plan.reserveUsd + plan.yieldUsd + plan.growthUsd).toBe(1000);
    expect(plan.lbtcQty).toBeGreaterThan(0);
  });

  it('forces full reserve when LTV is near max', () => {
    const plan = buildBorrowedUsdcSplitPlan({
      temperamentPct: 50,
      collateralUsd: 10_000,
      currentDebtUsd: 3_000,
      proposedBorrowUsd: 500,
      maxLtvPct: 33,
      btcPrice: 95_000,
    });
    expect(plan.safetyMode).toBe(true);
    expect(plan.yieldUsd).toBe(0);
    expect(plan.growthUsd).toBe(0);
    expect(plan.reserveUsd).toBe(300);
  });
});
