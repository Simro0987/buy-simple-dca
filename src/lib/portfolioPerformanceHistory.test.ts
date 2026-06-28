import { describe, expect, it } from 'vitest';
import {
  buildMockPortfolioPerformance,
  performanceRangeChangePct,
} from './portfolioPerformanceHistory';

describe('buildMockPortfolioPerformance', () => {
  it('anchors the last point to the live portfolio value', () => {
    const points = buildMockPortfolioPerformance(12_345.67, 7);
    expect(points).toHaveLength(7);
    expect(points[points.length - 1].value).toBe(12_345.67);
  });

  it('produces a generally upward curve over 30 days', () => {
    const points = buildMockPortfolioPerformance(10_000, 30);
    expect(points[0].value).toBeLessThan(points[points.length - 1].value);
  });

  it('returns empty array for zero value', () => {
    expect(buildMockPortfolioPerformance(0, 30)).toEqual([]);
  });
});

describe('performanceRangeChangePct', () => {
  it('computes percent change from first to last point', () => {
    const pct = performanceRangeChangePct([
      { date: '2026-01-01', shortLabel: 'Jan 1', value: 100 },
      { date: '2026-01-02', shortLabel: 'Jan 2', value: 110 },
    ]);
    expect(pct).toBeCloseTo(10, 5);
  });
});
