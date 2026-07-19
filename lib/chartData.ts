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
