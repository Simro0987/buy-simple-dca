import { cgFetch } from '@/lib/coingecko';

export interface PortfolioPerformancePoint {
  time: number;
  date: string;
  shortLabel: string;
  value: number;
}

export type PortfolioPerformanceRange = 7 | 30;

export interface PortfolioHoldingsMap {
  bitcoin: number;
  ethereum: number;
  solana: number;
}

interface MarketChartResponse {
  prices: Array<[number, number]>;
}

const COIN_IDS: Array<{ id: keyof PortfolioHoldingsMap; cgId: string }> = [
  { id: 'bitcoin', cgId: 'bitcoin' },
  { id: 'ethereum', cgId: 'ethereum' },
  { id: 'solana', cgId: 'solana' },
];

async function fetchCoinMarketChart(coinId: string, days: PortfolioPerformanceRange): Promise<Array<[number, number]>> {
  const params: Record<string, string | number> = { vs_currency: 'usd', days };
  if (days > 7) params.interval = 'daily';

  const res = await cgFetch(`/coins/${coinId}/market_chart`, params);
  if (!res.ok) throw new Error(`CoinGecko market_chart failed for ${coinId}: ${res.status}`);
  const data = (await res.json()) as MarketChartResponse;
  return data.prices ?? [];
}

/** Nearest historical price at a target timestamp. */
export function priceAtTimestamp(series: Array<[number, number]>, targetTs: number): number {
  if (series.length === 0) return 0;
  let best = series[0][1];
  let bestDiff = Math.abs(series[0][0] - targetTs);
  for (const [ts, price] of series) {
    const diff = Math.abs(ts - targetTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = price;
    }
  }
  return best;
}

/**
 * Sum holdings × historical prices across aligned CoinGecko timestamps.
 */
export function buildPortfolioPerformanceSeries(
  holdings: PortfolioHoldingsMap,
  charts: Partial<Record<keyof PortfolioHoldingsMap, Array<[number, number]>>>,
): PortfolioPerformancePoint[] {
  const active = COIN_IDS.filter(({ id }) => (holdings[id] ?? 0) > 0 && (charts[id]?.length ?? 0) > 0);
  if (active.length === 0) return [];

  const timestamps = new Set<number>();
  for (const { id } of active) {
    for (const [ts] of charts[id] ?? []) timestamps.add(ts);
  }

  const sortedTs = Array.from(timestamps).sort((a, b) => a - b);

  return sortedTs.map((time) => {
    let value = 0;
    for (const { id } of active) {
      const amount = holdings[id] ?? 0;
      const price = priceAtTimestamp(charts[id] ?? [], time);
      value += amount * price;
    }

    const dateObj = new Date(time);
    return {
      time,
      date: dateObj.toISOString(),
      shortLabel: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Math.round(value * 100) / 100,
    };
  });
}

export async function fetchPortfolioPerformanceHistory(
  holdings: PortfolioHoldingsMap,
  days: PortfolioPerformanceRange,
): Promise<PortfolioPerformancePoint[]> {
  const hasHoldings = holdings.bitcoin > 0 || holdings.ethereum > 0 || holdings.solana > 0;
  if (!hasHoldings) return [];

  const charts: Partial<Record<keyof PortfolioHoldingsMap, Array<[number, number]>>> = {};

  await Promise.all(
    COIN_IDS.map(async ({ id, cgId }) => {
      if ((holdings[id] ?? 0) <= 0) return;
      try {
        charts[id] = await fetchCoinMarketChart(cgId, days);
      } catch {
        charts[id] = [];
      }
    }),
  );

  return buildPortfolioPerformanceSeries(holdings, charts);
}

export function performanceRangeChangePct(points: PortfolioPerformancePoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (first <= 0) return 0;
  return ((last - first) / first) * 100;
}
