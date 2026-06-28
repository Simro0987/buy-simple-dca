export interface PortfolioPerformancePoint {
  date: string;
  shortLabel: string;
  value: number;
}

export type PortfolioPerformanceRange = 7 | 30;

/**
 * Simulated portfolio value history anchored to the live total.
 * Last point always equals `currentValueUsd`; earlier points form a smooth growth curve.
 */
export function buildMockPortfolioPerformance(
  currentValueUsd: number,
  days: PortfolioPerformanceRange = 30,
): PortfolioPerformancePoint[] {
  if (currentValueUsd <= 0) return [];

  const points: PortfolioPerformancePoint[] = [];
  const startRatio = days === 7 ? 0.965 : 0.9;
  const startValue = currentValueUsd * startRatio;

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));

    const t = days === 1 ? 1 : i / (days - 1);
    const eased = 1 - Math.pow(1 - t, 1.35);
    const base = startValue + (currentValueUsd - startValue) * eased;
    const wobble =
      Math.sin(i * 2.17) * currentValueUsd * 0.006 +
      Math.cos(i * 0.83) * currentValueUsd * 0.003;
    const value = i === days - 1 ? currentValueUsd : Math.max(0, base + wobble);

    points.push({
      date: date.toISOString().slice(0, 10),
      shortLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Math.round(value * 100) / 100,
    });
  }

  return points;
}

export function performanceRangeChangePct(points: PortfolioPerformancePoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (first <= 0) return 0;
  return ((last - first) / first) * 100;
}
