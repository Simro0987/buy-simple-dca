"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { AddAssetButton } from "@/components/AddAssetButton";
import { AssetList } from "@/components/AssetList";
import { BottomNav, type Tab } from "@/components/BottomNav";
import { ConfluenceRadar } from "@/components/ConfluenceRadar";
import { DcaEngine } from "@/components/dca/DcaEngine";
import { EditHoldingsModal } from "@/components/EditHoldingsModal";
import { HeroSection } from "@/components/HeroSection";
import { LiveIndicator } from "@/components/LiveIndicator";
import { NewsFeed } from "@/components/NewsFeed";
import { PortfolioChart } from "@/components/PortfolioChart";
import { SettingsButton, SettingsModal } from "@/components/SettingsModal";
import { Toast } from "@/components/Toast";
import { TransactionHistory } from "@/components/TransactionHistory";
import { YieldTokensList } from "@/components/YieldTokensList";
import { usePortfolio } from "@/hooks/usePortfolio";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { pageTransition } from "@/lib/motion";

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("portfolio");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const {
    assets,
    holdings,
    transactions,
    totalBalance,
    realizedDeposit,
    profitLoss,
    loading,
    isLive,
    prices,
    updateHoldings,
    importPortfolio,
    recordDcaPurchase,
    portfolioData,
  } = usePortfolio();

  const showHome = activeTab === "home";
  const showPortfolio = activeTab === "portfolio";
  const showDca = activeTab === "dca";
  const showNews = activeTab === "news";

  const handleRecordPurchase = useCallback(
    (plans: TokenExecutionPlan[]) => {
      if (!prices) return false;

      const recorded = recordDcaPurchase(plans, prices);
      if (recorded) {
        setToastMessage("Záznam uložený");
      }
      return recorded;
    },
    [prices, recordDcaPurchase],
  );

  return (
    <div className="relative min-h-dvh bg-[#050505]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-72 w-72 rounded-full bg-purple-500/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-orange-500/5 blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-lg px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
              Edge Trader
            </p>
            <p className="text-sm font-medium text-zinc-400">Terminal v2.0</p>
          </div>
          <div className="flex items-center gap-2">
            <SettingsButton onClick={() => setIsSettingsOpen(true)} />
            <LiveIndicator isLive={isLive} loading={loading} />
          </div>
        </header>

        <AnimatePresence mode="wait">
          {showHome && (
            <motion.div
              key="home"
              {...pageTransition}
              className="space-y-8"
            >
              <ConfluenceRadar />
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
                realizedDeposit={realizedDeposit}
                profitLoss={profitLoss}
                loading={loading}
                isLive={isLive}
              />
              <PortfolioChart endValue={totalBalance} loading={loading} />
              <AssetList assets={assets} loading={loading} />
              <YieldTokensList />
              <AddAssetButton onClick={() => setIsEditModalOpen(true)} />
              <TransactionHistory transactions={transactions} />
            </motion.div>
          )}

          {showDca && (
            <motion.div key="dca" {...pageTransition}>
              <DcaEngine
                prices={prices}
                loading={loading}
                onRecordPurchase={handleRecordPurchase}
              />
            </motion.div>
          )}

          {showNews && (
            <motion.div key="news" {...pageTransition}>
              <NewsFeed />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      <EditHoldingsModal
        open={isEditModalOpen}
        holdings={holdings}
        onClose={() => setIsEditModalOpen(false)}
        onSave={updateHoldings}
      />

      <SettingsModal
        open={isSettingsOpen}
        portfolioData={portfolioData}
        onClose={() => setIsSettingsOpen(false)}
        onImport={importPortfolio}
      />

      <Toast
        message={toastMessage ?? ""}
        visible={Boolean(toastMessage)}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}
