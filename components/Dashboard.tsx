"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddAssetButton } from "@/components/AddAssetButton";
import { ApiStatusBanner } from "@/components/ApiStatusBanner";
import { GlobalDataSync } from "@/components/GlobalDataSync";
import { GlobalLastUpdated } from "@/components/GlobalLastUpdated";
import { SwapPanel } from "@/components/SwapPanel";
import { AddAssetModal } from "@/components/AddAssetModal";
import { AssetList } from "@/components/AssetList";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { ConfluenceRadar } from "@/components/ConfluenceRadar";
import { DcaEngine } from "@/components/dca/DcaEngine";
import { HeroSection } from "@/components/HeroSection";
import { LiveIndicator } from "@/components/LiveIndicator";
import { NewsFeed } from "@/components/NewsFeed";
import { PortfolioBubbleAllocation } from "@/components/PortfolioBubbleAllocation";
import { PortfolioChart } from "@/components/PortfolioChart";
import { SettingsButton, SettingsModal } from "@/components/SettingsModal";
import { Toast } from "@/components/Toast";
import { TradeHistoryPanel } from "@/components/TradeHistoryPanel";
import { TradingModeToggle } from "@/components/TradingModeToggle";
import { TransactionHistory } from "@/components/TransactionHistory";
import { TransactionModal } from "@/components/TransactionModal";
import type { LiveAsset } from "@/hooks/usePortfolio";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useGlobalDataRefresh } from "@/hooks/useGlobalDataRefresh";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { pageTransition } from "@/lib/motion";
import { useAppStore } from "@/src/store/useAppStore";

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("portfolio");
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<LiveAsset | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hydrateTradingMode = useAppStore((state) => state.hydrateTradingMode);
  const fearGreedValue = useAppStore(
    (state) => state.dcaPlan.result?.fearGreedValue ?? 50,
  );

  useEffect(() => {
    hydrateTradingMode();
  }, [hydrateTradingMode]);

  const {
    assets,
    yieldAssets,
    satelliteAssets,
    allAssets,
    transactions,
    trackedAssets,
    totalBalance,
    totalInvested,
    profitLoss,
    loading,
    isLive,
    addAsset,
    recordTransaction,
    importPortfolio,
    recordDcaPurchase,
    recordDcaLegPurchase,
    resetAllData,
    portfolioData,
  } = usePortfolio();

  const portfolioHoldings = useMemo(
    () =>
      allAssets.map((asset) => ({
        symbol: asset.symbol,
        category: asset.category,
        usdValue: asset.usdValue,
        roiPercent: asset.roiPercent,
        hasPurchaseHistory: asset.hasPurchaseHistory,
      })),
    [allAssets],
  );

  const portfolioSymbols = useMemo(
    () => portfolioHoldings.map((asset) => asset.symbol),
    [portfolioHoldings],
  );

  const { refresh: refreshGlobalData, isRefreshing, lastUpdated } =
    useGlobalDataRefresh();

  const showHome = activeTab === "home";
  const showPortfolio = activeTab === "portfolio";
  const showDca = activeTab === "dca";
  const showNews = activeTab === "news";
  const showSwap = activeTab === "swap";

  const handleRecordMarketLeg = useCallback(
    (plan: TokenExecutionPlan) => {
      const recorded = recordDcaLegPurchase(plan, "market");
      if (recorded) {
        const amount =
          plan.spotPrice > 0 ? plan.marketUsd / plan.spotPrice : 0;
        setToastMessage(
          `Market nákup ${plan.symbol}: ${formatMarketLegToast(plan.marketUsd, amount)}`,
        );
      } else {
        setToastMessage(
          `Market ${plan.symbol} — token musí byť v portfóliu s platnou cenou`,
        );
      }
      return recorded;
    },
    [recordDcaLegPurchase],
  );

  function formatMarketLegToast(spentUsd: number, amount: number): string {
    return `$${spentUsd.toFixed(2)} • ${amount.toFixed(6)} ks`;
  }

  const handleRecordPurchase = useCallback(
    (plans: TokenExecutionPlan[]) => {
      const recorded = recordDcaPurchase(plans);
      if (recorded) {
        setToastMessage("Záznam uložený");
      } else {
        setToastMessage(
          "Žiadny záznam — token musí byť v portfóliu s platnou cenou",
        );
      }
      return recorded;
    },
    [recordDcaPurchase],
  );

  const handleOpenTransactions = useCallback((asset: LiveAsset) => {
    setSelectedAsset(asset);
  }, []);

  const handleAddAsset = useCallback(
    (input: Parameters<typeof addAsset>[0]) => {
      const asset = addAsset(input);
      if (asset) {
        setToastMessage(`${asset.symbol} pridané do portfólia`);
      }
    },
    [addAsset],
  );

  const handleRecordTransaction = useCallback(
    (input: Parameters<typeof recordTransaction>[0]) => {
      const success = recordTransaction(input);
      if (success) {
        setToastMessage(
          input.type === "ADD" ? "Transakcia pridaná" : "Transakcia odstránená",
        );
      }
      return success;
    },
    [recordTransaction],
  );

  const handleResetAllData = useCallback(() => {
    resetAllData();
    setToastMessage("Všetky dáta boli vymazané");
  }, [resetAllData]);

  return (
    <div className="relative min-h-dvh bg-[#050505]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-72 w-72 rounded-full bg-purple-500/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-orange-500/5 blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-lg px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
              Edge Trader
            </p>
            <p className="text-sm font-medium text-zinc-400">Terminal v2.0</p>
            <div className="mt-1.5">
              <GlobalLastUpdated
                lastUpdated={lastUpdated}
                isRefreshing={isRefreshing}
                onRefresh={() => void refreshGlobalData()}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TradingModeToggle compact />
            <SettingsButton onClick={() => setIsSettingsOpen(true)} />
            <LiveIndicator
              isLive={isLive}
              loading={loading || isRefreshing}
            />
          </div>
        </header>

        <GlobalDataSync
          portfolioSymbols={portfolioSymbols}
          trackedAssets={trackedAssets}
        />

        <ApiStatusBanner />

        <AnimatePresence mode="wait">
          {showHome && (
            <motion.div key="home" {...pageTransition} className="space-y-8">
              <ConfluenceRadar
                fearGreed={fearGreedValue}
                portfolioSymbols={portfolioSymbols}
                trackedAssets={trackedAssets}
              />
            </motion.div>
          )}

          {showPortfolio && (
            <motion.div
              key="portfolio"
              {...pageTransition}
              className="space-y-8"
            >
              <HeroSection
                totalBalance={totalBalance}
                totalInvested={totalInvested}
                profitLoss={profitLoss}
                loading={loading}
                isLive={isLive}
              />

              <PortfolioChart
                endValue={totalBalance}
                transactions={transactions}
                loading={loading}
              />

              <PortfolioBubbleAllocation
                assets={allAssets}
                loading={loading}
              />

              <AssetList
                category="core"
                assets={assets}
                loading={loading}
                onOpenTransactions={handleOpenTransactions}
              />
              <AssetList
                category="satellite"
                assets={satelliteAssets}
                loading={loading}
                onOpenTransactions={handleOpenTransactions}
              />
              <AssetList
                category="yield"
                assets={yieldAssets}
                loading={loading}
                onOpenTransactions={handleOpenTransactions}
              />
              <AddAssetButton onClick={() => setIsAddAssetOpen(true)} />
              <TransactionHistory transactions={transactions} />
              <TradeHistoryPanel />
            </motion.div>
          )}

          {showDca && (
            <motion.div key="dca" {...pageTransition}>
              <DcaEngine
                portfolioSymbols={portfolioSymbols}
                trackedAssets={trackedAssets}
                portfolioHoldings={portfolioHoldings}
                dcaTransactions={transactions}
                loading={loading}
                onRecordPurchase={handleRecordPurchase}
                onRecordMarketLeg={handleRecordMarketLeg}
              />
            </motion.div>
          )}

          {showNews && (
            <motion.div key="news" {...pageTransition}>
              <NewsFeed />
            </motion.div>
          )}
          {showSwap && (
            <motion.div key="swap" {...pageTransition}>
              <SwapPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      <AddAssetModal
        open={isAddAssetOpen}
        onClose={() => setIsAddAssetOpen(false)}
        onAdd={handleAddAsset}
        existingCoingeckoIds={trackedAssets.map((asset) => asset.coingeckoId)}
      />

      <TransactionModal
        open={Boolean(selectedAsset)}
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
        onSubmit={handleRecordTransaction}
      />

      <SettingsModal
        open={isSettingsOpen}
        portfolioData={portfolioData}
        onClose={() => setIsSettingsOpen(false)}
        onImport={importPortfolio}
        onResetAllData={handleResetAllData}
      />

      <Toast
        message={toastMessage ?? ""}
        visible={Boolean(toastMessage)}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}
