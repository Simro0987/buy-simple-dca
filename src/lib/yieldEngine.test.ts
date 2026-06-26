import { describe, expect, it } from 'vitest';
import {
  buildYieldEnginePlan,
  isNegativeCarry,
  resolveYieldEngineStrategy,
} from '@/lib/yieldEngine';

describe('yieldEngine', () => {
  it('detects negative carry', () => {
    expect(isNegativeCarry(6, 4)).toBe(true);
    expect(isNegativeCarry(3, 5)).toBe(false);
  });

  it('prefers hold cash when volatility is high', () => {
    expect(resolveYieldEngineStrategy({
      volatilityHigh: true,
      borrowApyPct: 3,
      usdcSupplyApyPct: 5,
    })).toBe('hold_cash');
  });

  it('builds yield engine when USDC is borrowed', () => {
    const plan = buildYieldEnginePlan({
      usdcDebtUsd: 500,
      proposedBorrowUsd: 0,
      collateralUsd: 10_000,
      maxLtvPct: 33,
      borrowApyPct: 4,
      usdcSupplyApyPct: 5,
      volatilityHigh: false,
      supplyOnlyMode: false,
    });
    expect(plan.enabled).toBe(true);
    expect(plan.borrowedUsdcUsd).toBe(500);
    expect(plan.deployUsd).toBe(500);
  });

  it('disables yield engine in supply only mode', () => {
    const plan = buildYieldEnginePlan({
      usdcDebtUsd: 500,
      proposedBorrowUsd: 300,
      collateralUsd: 10_000,
      maxLtvPct: 33,
      borrowApyPct: 4,
      volatilityHigh: false,
      supplyOnlyMode: true,
    });
    expect(plan.enabled).toBe(false);
  });
});
