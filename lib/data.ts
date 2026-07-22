export type AssetAccent = "orange" | "purple" | "cyan";

export interface PortfolioAsset {
  symbol: string;
  name: string;
  balance: number;
  accent: AssetAccent;
}

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

export {
  formatCopyAmount2,
  formatCopyAmount4,
  formatDecimal,
  formatNumber4,
  formatPct,
  formatRsi,
  formatSignedPct,
  formatUnitPrice,
  formatUsd,
} from "@/lib/numberFormat";

import { formatDecimal } from "@/lib/numberFormat";

export function formatCrypto(value: number, symbol: string) {
  const decimals = symbol === "BTC" ? 4 : symbol === "ETH" ? 4 : 4;
  return `${formatDecimal(value, decimals)} ${symbol}`;
}
