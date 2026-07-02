import { describe, expect, it } from 'vitest';
import {
  buildPortfolioPerformanceSeries,
  performanceRangeChangePct,
  priceAtTimestamp,
} from './portfolioPerformanceHistory';

describe('priceAtTimestamp', () => {
  it('returns nearest price for a timestamp', () => {
    const series: Array<[number, number]> = [
      [1_000, 100],
      [2_000, 110],
      [3_000, 105],
    ];
    expect(priceAtTimestamp(series, 1_900)).toBe(110);
  });
});

describe('buildPortfolioPerformanceSeries', () => {
  it('sums holdings × prices across assets', () => {
    const points = buildPortfolioPerformanceSeries(
      { bitcoin: 1, ethereum: 2, solana: 0 },
      {
        bitcoin: [[1_000, 100], [2_000, 120]],
        ethereum: [[1_000, 10], [2_000, 12]],
      },
    );

    expect(points).toHaveLength(2);
    expect(points[0].value).toBe(120);
    expect(points[1].value).toBe(144);
  });
});

describe('performanceRangeChangePct', () => {
  it('computes percent change from first to last point', () => {
    const pct = performanceRangeChangePct([
      { time: 1, date: '2026-01-01', shortLabel: 'Jan 1', value: 100 },
      { time: 2, date: '2026-01-02', shortLabel: 'Jan 2', value: 110 },
    ]);
    expect(pct).toBeCloseTo(10, 5);
  });
});
