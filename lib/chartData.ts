import type { Transaction } from "@/lib/portfolioStorage";

export type ChartTimeframe = "24h" | "7d" | "30d" | "3m" | "1y" | "ALL";

export interface PortfolioHistoryPoint {
  date: string;
  label: string;
  value: number;
}

export const TIMEFRAME_LABELS: Record<ChartTimeframe, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  "3m": "3m",
  "1y": "1y",
  ALL: "ALL",
};

const TIMEFRAME_MS: Record<ChartTimeframe, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  ALL: null,
};

const TIMEFRAME_POINTS: Record<ChartTimeframe, number> = {
  "24h": 24,
  "7d": 7,
  "30d": 30,
  "3m": 30,
  "1y": 52,
  ALL: 60,
};

function formatLabel(date: Date, timeframe: ChartTimeframe): string {
  if (timeframe === "24h") {
    return date.toLocaleTimeString("sk-SK", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (timeframe === "1y" || timeframe === "ALL") {
    return date.toLocaleDateString("sk-SK", {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString("sk-SK", {
    month: "short",
    day: "numeric",
  });
}

function getInvestedAtTime(
  timeline: { time: number; value: number }[],
  targetTime: number,
): number {
  let invested = 0;
  for (const point of timeline) {
    if (point.time <= targetTime) {
      invested = point.value;
    }
  }
  return invested;
}

export function generatePortfolioHistoryForTimeframe(
  transactions: Transaction[],
  currentValue: number,
  timeframe: ChartTimeframe,
): PortfolioHistoryPoint[] {
  const now = Date.now();
  const rangeMs = TIMEFRAME_MS[timeframe];
  const pointCount = TIMEFRAME_POINTS[timeframe];
  const startTime =
    rangeMs === null
      ? transactions.length > 0
        ? Math.min(
            ...transactions.map((tx) => new Date(tx.date).getTime()),
            now - 30 * 24 * 60 * 60 * 1000,
          )
        : now - 30 * 24 * 60 * 60 * 1000
      : now - rangeMs;

  const sorted = [...transactions]
    .filter((tx) => tx.type !== "REMOVE")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const investedTimeline: { time: number; value: number }[] = [];
  let running = 0;
  for (const tx of sorted) {
    running += tx.spentUsd > 0 ? tx.spentUsd : 0;
    investedTimeline.push({
      time: new Date(tx.date).getTime(),
      value: running,
    });
  }

  const totalInvested = running;
  const startValue = Math.max(
    totalInvested > 0 ? totalInvested * 0.9 : 0,
    currentValue > 0 ? currentValue * 0.5 : 0,
  );

  const points: PortfolioHistoryPoint[] = [];
  const step = (now - startTime) / Math.max(pointCount - 1, 1);

  for (let i = 0; i < pointCount; i++) {
    const time = startTime + step * i;
    const date = new Date(time);
    const investedAtPoint = getInvestedAtTime(investedTimeline, time);
    const progress = pointCount > 1 ? i / (pointCount - 1) : 1;
    const baseline = Math.max(investedAtPoint, startValue);
    const value =
      currentValue <= 0
        ? 0
        : baseline + (currentValue - baseline) * progress;

    points.push({
      date: date.toISOString(),
      label: formatLabel(date, timeframe),
      value: Math.round(value * 100) / 100,
    });
  }

  if (points.length > 0) {
    points[points.length - 1].value = currentValue;
  }

  return points;
}
