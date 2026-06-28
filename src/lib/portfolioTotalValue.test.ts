import { describe, expect, it } from 'vitest';
import { computePortfolioTotalValue } from './portfolioTotalValue';

describe('computePortfolioTotalValue', () => {
  it('sums holdings × live prices for BTC, ETH, and SOL', () => {
    const total = computePortfolioTotalValue(
      0.01746423,
      0.23278498,
      2.60983568,
      100_000,
      4_000,
      200,
    );
    // BTC 1746.42 + ETH 931.14 + SOL 521.97 ≈ 3199.53
    expect(total).toBeCloseTo(3199.53, 0);
  });

  it('returns 0 when all amounts or prices are zero', () => {
    expect(computePortfolioTotalValue(0, 0, 0, 100_000, 4_000, 200)).toBe(0);
    expect(computePortfolioTotalValue(1, 1, 1, 0, 0, 0)).toBe(0);
  });
});
