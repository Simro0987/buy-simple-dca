import type { CryptoSymbol } from "@/lib/cryptoApi";
import type { Transaction } from "@/lib/portfolioStorage";

export interface SymbolPnL {
  symbol: string;
  avgBuyPrice: number;
  totalSpent: number;
  totalBought: number;
  pnlUsd: number;
  roiPercent: number;
  hasPurchaseHistory: boolean;
}

export interface PortfolioPnL {
  totalInvested: number;
  totalPnlUsd: number;
  totalRoiPercent: number;
  bySymbol: Record<CryptoSymbol, SymbolPnL>;
}

function emptySymbolPnL(symbol: string): SymbolPnL {
  return {
    symbol,
    avgBuyPrice: 0,
    totalSpent: 0,
    totalBought: 0,
    pnlUsd: 0,
    roiPercent: 0,
    hasPurchaseHistory: false,
  };
}

export function calculateSymbolPnL(
  transactions: Transaction[],
  symbol: CryptoSymbol,
  balance: number,
  livePrice: number,
): SymbolPnL {
  const symbolTx = transactions.filter((tx) => tx.symbol === symbol);

  if (symbolTx.length === 0) {
    return emptySymbolPnL(symbol);
  }

  const totalSpent = symbolTx.reduce((sum, tx) => sum + tx.spentUsd, 0);
  const totalBought = symbolTx.reduce((sum, tx) => sum + tx.amount, 0);
  const avgBuyPrice = totalBought > 0 ? totalSpent / totalBought : 0;

  const pnlUsd = avgBuyPrice > 0 ? (livePrice - avgBuyPrice) * balance : 0;
  const roiPercent =
    avgBuyPrice > 0 ? ((livePrice - avgBuyPrice) / avgBuyPrice) * 100 : 0;

  return {
    symbol,
    avgBuyPrice,
    totalSpent,
    totalBought,
    pnlUsd,
    roiPercent,
    hasPurchaseHistory: true,
  };
}

export function calculatePortfolioPnL(
  transactions: Transaction[],
  holdings: Record<CryptoSymbol, number>,
  prices: Record<CryptoSymbol, { price: number } | undefined>,
  symbols: CryptoSymbol[],
): PortfolioPnL {
  const bySymbol = {} as Record<CryptoSymbol, SymbolPnL>;

  for (const symbol of symbols) {
    bySymbol[symbol] = calculateSymbolPnL(
      transactions,
      symbol,
      holdings[symbol],
      prices[symbol]?.price ?? 0,
    );
  }

  const totalInvested = transactions.reduce((sum, tx) => sum + tx.spentUsd, 0);
  const totalPnlUsd = symbols.reduce(
    (sum, symbol) => sum + bySymbol[symbol].pnlUsd,
    0,
  );
  const totalRoiPercent =
    totalInvested > 0 ? (totalPnlUsd / totalInvested) * 100 : 0;

  return {
    totalInvested,
    totalPnlUsd,
    totalRoiPercent,
    bySymbol,
  };
}
