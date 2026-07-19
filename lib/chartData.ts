import type { Transaction } from "@/lib/portfolioStorage";

export interface PortfolioHistoryPoint {
  date: string;
  label: string;
  value: number;
}

export function generatePortfolioHistory(
  startValue = 3000,
  endValue = 5747.87,
  days = 30,
): PortfolioHistoryPoint[] {
  const data: PortfolioHistoryPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const progress = (days - 1 - i) / (days - 1);
    const base = startValue + (endValue - startValue) * progress;
    const wave = Math.sin(i * 1.1) * 72 + Math.cos(i * 0.6) * 38;
    const value = Math.round((base + wave) * 100) / 100;

    data.push({
      date: date.toISOString().split("T")[0],
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value,
    });
  }

  data[data.length - 1].value = endValue;
  return data;
}

export function generatePortfolioHistoryFromActivity(
  transactions: Transaction[],
  currentValue: number,
  days = 30,
): PortfolioHistoryPoint[] {
  if (currentValue <= 0) {
    return generatePortfolioHistory(0, 0, days);
  }

  const sorted = [...transactions]
    .filter((tx) => tx.type !== "REMOVE")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalInvested = sorted.reduce(
    (sum, tx) => sum + (tx.spentUsd > 0 ? tx.spentUsd : 0),
    0,
  );

  const startValue = Math.max(totalInvested * 0.85, currentValue * 0.55, 1);
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));

  const investedTimeline: { time: number; value: number }[] = [];
  let running = 0;
  for (const tx of sorted) {
    running += tx.spentUsd > 0 ? tx.spentUsd : 0;
    investedTimeline.push({
      time: new Date(tx.date).getTime(),
      value: running,
    });
  }

  const points: PortfolioHistoryPoint[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dayTime = date.getTime();

    let investedAtDay = 0;
    for (const point of investedTimeline) {
      if (point.time <= dayTime + 86_400_000) {
        investedAtDay = point.value;
      }
    }

    const progress = i / (days - 1);
    const baseline = Math.max(investedAtDay, startValue);
    const value = baseline + (currentValue - baseline) * progress;

    points.push({
      date: date.toISOString().split("T")[0],
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: Math.round(value * 100) / 100,
    });
  }

  points[points.length - 1].value = currentValue;
  return points;
}
