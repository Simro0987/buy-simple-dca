"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortfolioAsset } from "@/lib/data";
import { portfolioHoldings } from "@/lib/data";
import {
  fetchPortfolioPrices,
  type CryptoPricesMap,
  type DynamicPricesMap,
} from "@/lib/cryptoApi";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { calculatePortfolioPnL } from "@/lib/pnlAnalytics";
import {
  computeBalanceFromTransactions,
  computeHoldingsMap,
  createDefaultPortfolio,
  createTrackedAsset,
  createTransactionId,
  findAssetByCoingeckoId,
  readPortfolioFromStorage,
  writePortfolioToStorage,
  type AssetCategory,
  type HoldingsMap,
  type PortfolioData,
  type TrackedAsset,
  type Transaction,
  type TransactionType,
} from "@/lib/portfolioStorage";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";

export interface LiveAsset extends PortfolioAsset {
  id: string;
  coingeckoId: string;
  logoUrl: string;
  category: AssetCategory;
  usdValue: number;
  unitPrice: number;
  avgBuyPrice: number;
  pnlUsd: number;
  roiPercent: number;
  hasPurchaseHistory: boolean;
  transactions: Transaction[];
}

export interface AddAssetInput {
  symbol: string;
  name: string;
  coingeckoId: string;
  logoUrl: string;
  category?: AssetCategory;
}

export interface RecordTransactionInput {
  assetId: string;
  type: Extract<TransactionType, "ADD" | "REMOVE">;
  amount: number;
  priceUsd?: number;
  date: string;
}

const CORE_SYMBOLS = ["BTC", "ETH", "SOL"];

export function usePortfolio() {
  const { prices: corePrices, loading: coreLoading, error, isLive, lastUpdated } =
    useCryptoPrices();

  const [portfolio, setPortfolio] = useState<PortfolioData>(
    createDefaultPortfolio(),
  );
  const [dynamicPrices, setDynamicPrices] = useState<DynamicPricesMap>({});
  const [pricesLoading, setPricesLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  const persistPortfolio = useCallback((data: PortfolioData) => {
    setPortfolio(data);
    writePortfolioToStorage(data);
  }, []);

  useEffect(() => {
    const stored = readPortfolioFromStorage();
    if (stored) {
      setPortfolio(stored);
    }
    setIsHydrated(true);
  }, []);

  const coingeckoIds = useMemo(
    () => portfolio.assets.map((asset) => asset.coingeckoId),
    [portfolio.assets],
  );

  const loadDynamicPrices = useCallback(async () => {
    if (coingeckoIds.length === 0) {
      setDynamicPrices({});
      setPricesLoading(false);
      return;
    }

    try {
      const next = await fetchPortfolioPrices(coingeckoIds);
      setDynamicPrices(next);
    } catch {
      // Keep previous prices on failure
    } finally {
      setPricesLoading(false);
    }
  }, [coingeckoIds]);

  useEffect(() => {
    void loadDynamicPrices();
    const interval = setInterval(() => {
      void loadDynamicPrices();
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadDynamicPrices]);

  const getAssetPrice = useCallback(
    (asset: TrackedAsset) =>
      dynamicPrices[asset.coingeckoId]?.price ??
      corePrices[asset.symbol as keyof CryptoPricesMap]?.price ??
      0,
    [corePrices, dynamicPrices],
  );

  const buildLiveAsset = useCallback(
    (asset: TrackedAsset, symbolPnl: ReturnType<typeof calculatePortfolioPnL>["bySymbol"][string], assetTransactions: Transaction[]): LiveAsset => {
      const balance = computeBalanceFromTransactions(
        asset.id,
        portfolio.transactions,
      );
      const unitPrice = getAssetPrice(asset);

      return {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        coingeckoId: asset.coingeckoId,
        logoUrl: asset.logoUrl,
        category: asset.category,
        accent: asset.accent ?? "cyan",
        balance,
        unitPrice,
        usdValue: balance * unitPrice,
        avgBuyPrice: symbolPnl.avgBuyPrice,
        pnlUsd: symbolPnl.pnlUsd,
        roiPercent: symbolPnl.roiPercent,
        hasPurchaseHistory: symbolPnl.hasPurchaseHistory,
        transactions: assetTransactions,
      };
    },
    [getAssetPrice, portfolio.transactions],
  );

  const holdings = useMemo(
    () => computeHoldingsMap(portfolio.assets, portfolio.transactions),
    [portfolio.assets, portfolio.transactions],
  );

  const pnl = useMemo(() => {
    const balances: Record<string, number> = {};
    const symbols: string[] = [];

    for (const asset of portfolio.assets) {
      balances[asset.symbol] = computeBalanceFromTransactions(
        asset.id,
        portfolio.transactions,
      );
      symbols.push(asset.symbol);
    }

    const priceMap: Record<string, { price: number }> = {};
    for (const asset of portfolio.assets) {
      priceMap[asset.symbol] = { price: getAssetPrice(asset) };
    }

    return calculatePortfolioPnL(
      portfolio.transactions,
      balances,
      priceMap,
      symbols,
    );
  }, [getAssetPrice, portfolio.assets, portfolio.transactions]);

  const allAssets = useMemo<LiveAsset[]>(() => {
    return portfolio.assets.map((asset) => {
      const assetTransactions = portfolio.transactions.filter(
        (tx) => tx.assetId === asset.id,
      );
      return buildLiveAsset(
        asset,
        pnl.bySymbol[asset.symbol] ?? {
          symbol: asset.symbol,
          avgBuyPrice: 0,
          totalSpent: 0,
          totalBought: 0,
          pnlUsd: 0,
          roiPercent: 0,
          hasPurchaseHistory: false,
        },
        assetTransactions,
      );
    });
  }, [buildLiveAsset, pnl.bySymbol, portfolio.assets, portfolio.transactions]);

  const coreAssets = useMemo(
    () => allAssets.filter((asset) => asset.category === "core"),
    [allAssets],
  );

  const yieldAssets = useMemo(
    () => allAssets.filter((asset) => asset.category === "yield"),
    [allAssets],
  );

  const cryptoTotal = useMemo(
    () => allAssets.reduce((sum, asset) => sum + asset.usdValue, 0),
    [allAssets],
  );

  const coreTotal = useMemo(
    () => coreAssets.reduce((sum, asset) => sum + asset.usdValue, 0),
    [coreAssets],
  );

  const yieldTotal = useMemo(
    () => yieldAssets.reduce((sum, asset) => sum + asset.usdValue, 0),
    [yieldAssets],
  );

  const totalBalance = cryptoTotal + portfolioHoldings.cashUsd;

  const addAsset = useCallback(
    (input: AddAssetInput) => {
      const existing = findAssetByCoingeckoId(
        portfolio.assets,
        input.coingeckoId,
      );
      if (existing) return existing;

      const coreSymbols = ["BTC", "ETH", "SOL"];
      const category =
        input.category ??
        (coreSymbols.includes(input.symbol.toUpperCase()) ? "core" : "yield");

      const nextAsset = createTrackedAsset({
        symbol: input.symbol,
        name: input.name,
        coingeckoId: input.coingeckoId,
        logoUrl: input.logoUrl,
        category,
      });

      persistPortfolio({
        ...portfolio,
        assets: [...portfolio.assets, nextAsset],
      });

      return nextAsset;
    },
    [persistPortfolio, portfolio],
  );

  const recordTransaction = useCallback(
    (input: RecordTransactionInput) => {
      const asset = portfolio.assets.find((item) => item.id === input.assetId);
      if (!asset || input.amount <= 0) return false;

      const priceUsd = input.priceUsd ?? 0;
      const spentUsd =
        input.type === "REMOVE"
          ? priceUsd > 0
            ? input.amount * priceUsd
            : 0
          : priceUsd > 0
            ? input.amount * priceUsd
            : 0;

      const transaction: Transaction = {
        id: createTransactionId(),
        date: input.date,
        assetId: asset.id,
        symbol: asset.symbol,
        amount: input.amount,
        priceUsd,
        spentUsd,
        type: input.type,
      };

      persistPortfolio({
        ...portfolio,
        transactions: [transaction, ...portfolio.transactions],
      });

      return true;
    },
    [persistPortfolio, portfolio],
  );

  const importPortfolio = useCallback(
    (data: PortfolioData) => {
      persistPortfolio(data);
    },
    [persistPortfolio],
  );

  const updateHoldings = useCallback(
    (next: HoldingsMap) => {
      const transactions = [...portfolio.transactions];

      for (const asset of portfolio.assets.filter((item) => item.category === "core")) {
        const symbol = asset.symbol;
        if (!CORE_SYMBOLS.includes(symbol)) continue;

        const target = next[symbol as keyof HoldingsMap] ?? 0;
        const current = computeBalanceFromTransactions(asset.id, transactions);
        const delta = target - current;

        if (Math.abs(delta) < 1e-12) continue;

        transactions.unshift({
          id: createTransactionId(),
          date: new Date().toISOString(),
          assetId: asset.id,
          symbol: asset.symbol,
          amount: Math.abs(delta),
          priceUsd: 0,
          spentUsd: 0,
          type: delta > 0 ? "ADD" : "REMOVE",
        });
      }

      persistPortfolio({ ...portfolio, transactions });
    },
    [persistPortfolio, portfolio],
  );

  const recordDcaPurchase = useCallback(
    (plans: TokenExecutionPlan[], priceMap: CryptoPricesMap) => {
      const newTransactions: Transaction[] = [];

      for (const plan of plans) {
        const asset = portfolio.assets.find(
          (item) => item.symbol === plan.symbol && item.category === "core",
        );
        const unitPrice = priceMap[plan.symbol]?.price ?? 0;
        if (!asset || unitPrice <= 0 || plan.totalUsd <= 0) continue;

        const amount = plan.totalUsd / unitPrice;
        newTransactions.push({
          id: createTransactionId(),
          date: new Date().toISOString(),
          assetId: asset.id,
          symbol: asset.symbol,
          amount,
          priceUsd: unitPrice,
          spentUsd: plan.totalUsd,
          type: "DCA",
        });
      }

      if (newTransactions.length === 0) return false;

      persistPortfolio({
        ...portfolio,
        transactions: [...newTransactions, ...portfolio.transactions],
      });

      return true;
    },
    [persistPortfolio, portfolio],
  );

  return {
    assets: coreAssets,
    yieldAssets,
    allAssets,
    holdings,
    transactions: portfolio.transactions,
    trackedAssets: portfolio.assets,
    totalBalance,
    coreTotal,
    yieldTotal,
    totalInvested: pnl.totalInvested,
    profitLoss: pnl.totalPnlUsd,
    totalRoiPercent: pnl.totalRoiPercent,
    pnl,
    loading: coreLoading || pricesLoading || !isHydrated,
    error,
    isLive,
    lastUpdated,
    prices: corePrices,
    dynamicPrices,
    isHydrated,
    addAsset,
    recordTransaction,
    updateHoldings,
    importPortfolio,
    recordDcaPurchase,
    portfolioData: portfolio,
    refreshPrices: loadDynamicPrices,
  };
}

export type {
  HoldingsMap,
  Transaction,
  PortfolioData,
  TrackedAsset,
  TransactionType,
};
