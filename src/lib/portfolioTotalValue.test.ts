import { describe, expect, it } from 'vitest';
import { computePortfolioTotalValue } from './portfolioTotalValue';

describe('computePortfolioTotalValue', () => {
  it('sums holdings × live prices for BTC, ETH, and SOL', () => {
    const total = computePortfolioTotalValue(
      0.5,
      2,
      10,
      100_000,
      4_000,
      200,
    );
    // BTC 50k + ETH 8k + SOL 2k = 60k
    expect(total).toBeCloseTo(60_000, 0);
  });

  it('returns 0 when all amounts or prices are zero', () => {
    expect(computePortfolioTotalValue(0, 0, 0, 100_000, 4_000, 200)).toBe(0);
    expect(computePortfolioTotalValue(1, 1, 1, 0, 0, 0)).toBe(0);
  });
});
