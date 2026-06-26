import { describe, expect, it } from 'vitest';
import {
  buildCollateralManagementSnapshot,
  hasActiveCollateralPosition,
} from '@/lib/collateralManagement';

describe('collateralManagement', () => {
  it('hasActiveCollateralPosition is false for empty wallet', () => {
    expect(hasActiveCollateralPosition(0, 0)).toBe(false);
    expect(hasActiveCollateralPosition(0.5, 0)).toBe(true);
    expect(hasActiveCollateralPosition(0, 100)).toBe(true);
  });

  it('shows 0% LTV when collateral and debt are both zero', () => {
    const snapshot = buildCollateralManagementSnapshot({
      deployedQty: 0,
      collateralPrice: 3000,
      targetQty: 2,
      usdcDebt: 0,
      maxLtvPct: 33,
      proposedBorrowUsd: 1200,
    });
    expect(snapshot.currentLtvPct).toBe(0);
    expect(snapshot.projectedLtvPct).toBe(0);
    expect(snapshot.ltvStatus).toBe('safe');
  });

  it('does not use target collateral for LTV when position is empty', () => {
    const snapshot = buildCollateralManagementSnapshot({
      deployedQty: 0,
      collateralPrice: 3000,
      targetQty: 2,
      usdcDebt: 0,
      maxLtvPct: 33,
      proposedBorrowUsd: 600,
    });
    expect(snapshot.projectedLtvPct).not.toBe(20);
    expect(snapshot.projectedLtvPct).toBe(0);
  });

  it('computes LTV from deployed collateral only when position is active', () => {
    const snapshot = buildCollateralManagementSnapshot({
      deployedQty: 1,
      collateralPrice: 3000,
      targetQty: 2,
      usdcDebt: 600,
      maxLtvPct: 33,
      proposedBorrowUsd: 300,
    });
    expect(snapshot.currentLtvPct).toBe(20);
    expect(snapshot.projectedLtvPct).toBe(30);
  });
});
