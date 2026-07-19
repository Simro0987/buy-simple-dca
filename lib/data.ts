export const portfolioData = {
  totalBalance: 5747.87,
  realizedDeposit: -85.21,
  profitLoss: 5833.08,
  fearGreedIndex: 27,
  fearGreedLabel: "Fear",
  moneyMode: "CAPITULATION",
  allocation: [
    { symbol: "BTC", percent: 54, color: "#f97316" },
    { symbol: "ETH", percent: 25, color: "#a855f7" },
    { symbol: "SOL", percent: 10, color: "#22d3ee" },
    { symbol: "CASH", percent: 11, color: "#52525b" },
  ],
  assets: [
    {
      symbol: "BTC",
      name: "Bitcoin",
      balance: 0.0482,
      usdValue: 3103.85,
      change7d: 4.82,
      accent: "orange" as const,
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      balance: 0.612,
      usdValue: 1436.97,
      change7d: -2.14,
      accent: "purple" as const,
    },
    {
      symbol: "SOL",
      name: "Solana",
      balance: 4.28,
      usdValue: 574.79,
      change7d: 8.37,
      accent: "cyan" as const,
    },
  ],
};

export function formatUsd(value: number, options?: { showSign?: boolean }) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (options?.showSign && value > 0) return `+${formatted}`;
  if (options?.showSign && value < 0) return `-${formatted}`;
  return formatted;
}

export function formatCrypto(value: number, symbol: string) {
  const decimals = symbol === "BTC" ? 4 : symbol === "ETH" ? 3 : 2;
  return `${value.toFixed(decimals)} ${symbol}`;
}
