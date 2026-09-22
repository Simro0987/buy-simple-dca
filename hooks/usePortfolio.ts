"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import type { PortfolioAsset } from "@/lib/data";
import type { CryptoSymbol } from "@/lib/cryptoApi";
import type { PortfolioAssetRecord } from "@/lib/dca/executionLedger";
import type { TokenExecutionPlan } from "@/lib/dca/types";
import { isCoreHoldingSymbol } from "@/lib/dca/universe";
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
    (plans: TokenExecutionPlan[], priceMap: Record<string, number>) => {
      const payablePlans = plans.filter((plan) => plan.totalUsd > 0);
      if (payablePlans.length === 0) return false;

      const missingPrice = payablePlans.some(
        (plan) => (priceMap[plan.symbol] ?? 0) <= 0,
      );
      if (missingPrice) return false;

      const newTransactions: Transaction[] = [];
      const nextHoldings: HoldingsMap = { ...holdings };

      for (const plan of payablePlans) {
        const unitPrice = priceMap[plan.symbol] ?? 0;
        if (unitPrice <= 0) continue;

        const spentUsd = plan.executionUsd > 0 ? plan.executionUsd : plan.totalUsd;
        const amount = spentUsd / unitPrice;
        if (isCoreHoldingSymbol(plan.symbol)) {
          nextHoldings[plan.symbol] += amount;
        }

        newTransactions.push({
          id: createTransactionId(),
          date: new Date().toISOString(),
          symbol: plan.symbol,
          amount,
          priceUsd: unitPrice,
          spentUsd,
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

  const recordExecutionFill = useCallback(
    (record: PortfolioAssetRecord) => {
      if (!(record.spentUsd > 0) || !(record.tokenVolume > 0)) return false;

      const nextHoldings: HoldingsMap = { ...holdings };
      if (isCoreHoldingSymbol(record.symbol)) {
        nextHoldings[record.symbol] += record.tokenVolume;
      }

      persistPortfolio({
        holdings: nextHoldings,
        transactions: [
          {
            id: createTransactionId(),
            date: record.filledAt,
            symbol: record.symbol,
            amount: record.tokenVolume,
            priceUsd: record.priceUsd,
            spentUsd: record.spentUsd,
            type: "DCA",
          },
          ...transactions,
        ],
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
    recordExecutionFill,
    portfolioData: { holdings, transactions } satisfies PortfolioData,
  };
}

export type { HoldingsMap, CryptoSymbol, Transaction, PortfolioData };
