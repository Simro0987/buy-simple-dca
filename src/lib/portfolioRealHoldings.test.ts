import { describe, it, expect } from 'vitest';
import { buildDashboardFromUserHoldings, normalizeUserHoldings } from '@/lib/portfolioRealHoldings';

describe('portfolio zero-state safety', () => {
  it('buildDashboardFromUserHoldings does not throw on partial holdings', () => {
    const result = buildDashboardFromUserHoldings({} as never, {});
    expect(result.assets).toHaveLength(3);
    expect(result.totalValue).toBe(0);
  });

  it('normalizeUserHoldings fills missing rows', () => {
    const normalized = normalizeUserHoldings({ BTC: { tokenAmount: 1, averageBuyPrice: 0, investedUsd: 0 } } as never);
    expect(normalized.BTC.tokenAmount).toBe(1);
    expect(normalized.ETH.tokenAmount).toBe(0);
  });
});
