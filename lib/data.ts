export type AssetAccent = "orange" | "purple" | "cyan";

export interface PortfolioAsset {
  symbol: string;
  name: string;
  balance: number;
  accent: AssetAccent;
}

/** Cash is not a tracked live field. Never invent a dummy reserve for UI. */
export const portfolioHoldings = {
  cashUsd: 0,
  realizedDeposit: 0,
  profitLoss: 0,
};

/** @deprecated Use portfolioHoldings for static data; live values come from usePortfolio */
export const portfolioData = {
  ...portfolioHoldings,
  totalBalance: 0,
  fearGreedIndex: 27,
  fearGreedLabel: "Fear",
  moneyMode: "CAPITULATION",
  allocation: [
    { symbol: "BTC", percent: 54, color: "#f97316" },
    { symbol: "ETH", percent: 25, color: "#a855f7" },
    { symbol: "SOL", percent: 10, color: "#22d3ee" },
    { symbol: "CASH", percent: 11, color: "#52525b" },
  ],
  assets: [],
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

export function formatUnitPrice(value: number) {
  if (value >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  return formatUsd(value);
}
