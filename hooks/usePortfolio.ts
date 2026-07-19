"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import type { PortfolioAsset } from "@/lib/data";
import type { CryptoPricesMap, CryptoSymbol } from "@/lib/cryptoApi";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { calculatePortfolioPnL } from "@/lib/pnlAnalytics";
import {
  ASSET_DEFINITIONS,
  createTransactionId,
  DEFAULT_PORTFOLIO,
  readPortfolioFromStorage,
  writePortfolioToStorage,
  type HoldingsMap,
  type PortfolioData,
  type Transaction,
} from "@/lib/portfolioStorage";
import { portfolioHoldings } from "@/lib/data";

export interface LiveAsset extends PortfolioAsset {
  usdValue: number;
  unitPrice: number;
  avgBuyPrice: number;
  pnlUsd: number;
  roiPercent: number;
  hasPurchaseHistory: boolean;
}

const CORE_SYMBOLS: CryptoSymbol[] = ["BTC", "ETH", "SOL"];

export function usePortfolio() {
  const { prices, loading, error, isLive, lastUpdated } = useCryptoPrices();
  const [holdings, setHoldings] = useState<HoldingsMap>(DEFAULT_PORTFOLIO.holdings);
  const [transactions, setTransactions] = useState<Transaction[]>(
    DEFAULT_PORTFOLIO.transactions,
  );
  const [isHydrated, setIsHydrated] = useState(false);

  const persistPortfolio = useCallback((data: PortfolioData) => {
    setHoldings(data.holdings);
    setTransactions(data.transactions);
    writePortfolioToStorage(data);
  }, []);

  useEffect(() => {
    const stored = readPortfolioFromStorage();
    if (stored) {
      setHoldings(stored.holdings);
      setTransactions(stored.transactions);
    }
    setIsHydrated(true);
  }, []);

  const updateHoldings = useCallback(
    (next: HoldingsMap) => {
      persistPortfolio({ holdings: next, transactions });
    },
    [persistPortfolio, transactions],
  );

  const importPortfolio = useCallback(
    (data: PortfolioData) => {
      persistPortfolio(data);
    },
    [persistPortfolio],
  );

  const recordDcaPurchase = useCallback(
    (plans: TokenExecutionPlan[], priceMap: CryptoPricesMap) => {
      const newTransactions: Transaction[] = [];
      const nextHoldings: HoldingsMap = { ...holdings };

      for (const plan of plans) {
        const symbol = plan.symbol as CryptoSymbol;
        if (!(symbol in nextHoldings)) continue;

        const unitPrice =
          priceMap[symbol]?.price ?? plan.spotPrice ?? 0;
        if (unitPrice <= 0 || plan.totalUsd <= 0) continue;

        const amount = plan.totalUsd / unitPrice;
        nextHoldings[symbol] += amount;

        newTransactions.push({
          id: createTransactionId(),
          date: new Date().toISOString(),
          symbol,
          amount,
          priceUsd: unitPrice,
          spentUsd: plan.totalUsd,
          type: "DCA",
        });
      }

      if (newTransactions.length === 0) return false;

      const nextTransactions = [...newTransactions, ...transactions];
      persistPortfolio({
        holdings: nextHoldings,
        transactions: nextTransactions,
      });

      return true;
    },
    [holdings, persistPortfolio, transactions],
  );

  const pnl = useMemo(
    () => calculatePortfolioPnL(transactions, holdings, prices, CORE_SYMBOLS),
    [transactions, holdings, prices],
  );

  const assets = useMemo<LiveAsset[]>(() => {
    return ASSET_DEFINITIONS.map((definition) => {
      const live = prices[definition.symbol];
      const unitPrice = live?.price ?? 0;
      const balance = holdings[definition.symbol];
      const symbolPnl = pnl.bySymbol[definition.symbol];

      return {
        ...definition,
        balance,
        unitPrice,
        usdValue: balance * unitPrice,
        avgBuyPrice: symbolPnl.avgBuyPrice,
        pnlUsd: symbolPnl.pnlUsd,
        roiPercent: symbolPnl.roiPercent,
        hasPurchaseHistory: symbolPnl.hasPurchaseHistory,
      };
    });
  }, [holdings, prices, pnl.bySymbol]);

  const cryptoTotal = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.usdValue, 0),
    [assets],
  );

  const totalBalance = cryptoTotal + portfolioHoldings.cashUsd;

  return {
    assets,
    holdings,
    transactions,
    totalBalance,
    totalInvested: pnl.totalInvested,
    profitLoss: pnl.totalPnlUsd,
    totalRoiPercent: pnl.totalRoiPercent,
    pnl,
    loading: loading || !isHydrated,
    error,
    isLive,
    lastUpdated,
    prices,
    isHydrated,
    updateHoldings,
    importPortfolio,
    recordDcaPurchase,
    portfolioData: { holdings, transactions } satisfies PortfolioData,
  };
}

export type { HoldingsMap, CryptoSymbol, Transaction, PortfolioData };
