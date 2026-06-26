import { describe, expect, it } from 'vitest';
import { DEFAULT_HCD_INDICATORS } from '@/lib/hcdArchitecture';
import { computeTacticalWithdrawAlert } from '@/lib/hcdExitStrategy';

const urgentIndicators = {
  ...DEFAULT_HCD_INDICATORS,
  borrowApyPct: 12,
  volatilityRegime: 'high' as const,
};

describe('computeTacticalWithdrawAlert', () => {
  it('returns null when deployed collateral is zero', () => {
    const alert = computeTacticalWithdrawAlert({
      indicators: urgentIndicators,
      collateralQty: 1.5,
      deployedCollateralQty: 0,
      collateralPrice: 3000,
      usdcDebt: 0,
      tokenLabel: 'wETH',
      decimals: 4,
    });
    expect(alert).toBeNull();
  });

  it('returns alert when deployed collateral exists and market is urgent', () => {
    const alert = computeTacticalWithdrawAlert({
      indicators: urgentIndicators,
      collateralQty: 1.5,
      deployedCollateralQty: 0.8,
      collateralPrice: 3000,
      usdcDebt: 500,
      tokenLabel: 'wETH',
      decimals: 4,
    });
    expect(alert?.active).toBe(true);
    expect(alert?.withdrawQty).toBeGreaterThan(0);
  });

  it('does not treat target collateral as deployed collateral', () => {
    const alert = computeTacticalWithdrawAlert({
      indicators: urgentIndicators,
      collateralQty: 2,
      deployedCollateralQty: 0,
      collateralPrice: 3000,
      usdcDebt: 0,
      tokenLabel: 'wETH',
      decimals: 4,
    });
    expect(alert).toBeNull();
  });
});
