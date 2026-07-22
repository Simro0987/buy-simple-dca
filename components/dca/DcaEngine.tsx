"use client";

import { LayoutGroup, motion } from "framer-motion";
import { DcaMarketRegimeCard } from "@/components/dca/DcaHeroDashboard";
import { DcaBacktestModule } from "@/components/dca/DcaBacktestModule";
import { ExtremeMarketAlertBanner } from "@/components/dca/ExtremeMarketAlertBanner";
import { ExecutionPerformanceSection } from "@/components/dca/ExecutionPerformanceSection";
import { ExecutionEngineCards } from "@/components/dca/ExecutionEngineCards";
import { MarketRegimeFactorPills } from "@/components/dca/MarketRegimeFactorPills";
import { MasterAllocationCard } from "@/components/dca/MasterAllocationCard";
import { PortfolioBucketingCard } from "@/components/dca/PortfolioBucketingCard";
import { WeeklyInvestmentCard } from "@/components/dca/WeeklyInvestmentCard";
import { SmartMondayTimingBanner } from "@/components/dca/SmartMondayTimingBanner";
import { TradingModeToggle } from "@/components/TradingModeToggle";
import { usePortfolioBucketing } from "@/hooks/usePortfolioBucketing";
import type { OrderLeg } from "@/hooks/useExecutionDeployState";
import { useSmartMondayTiming } from "@/hooks/useSmartMondayTiming";
import { useDcaEngine } from "@/hooks/useDcaEngine";
import { useDcaLiveEngine } from "@/hooks/useDcaLiveEngine";
import { buildExchangeExecuteOrders } from "@/lib/exchange/buildExecutePayload";
import type { ExchangeExecuteResponse } from "@/lib/exchange/types";
import { buildFinalExecutionOrders } from "@/lib/dcaFinalExecutionOrders";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { Transaction, TrackedAsset, AssetCategory } from "@/lib/portfolioStorage";
import { buildPortfolioYieldContext } from "@/lib/yieldDataSources";
import {
  appendTradeRound,
  createSimulatedTradeRound,
  createTradeRound,
} from "@/lib/tradeHistory";
import {
  appendExecutionPerformanceEntries,
  appendSingleExecutionPerformanceEntry,
} from "@/lib/executionPerformanceLog";
import {
  cancelOpenLimitOrder,
  registerOpenLimitOrder,
} from "@/lib/openLimitOrders";
import { fetchAllTokenOctagonSnapshots } from "@/lib/tokenOctagonData";
import { DcaJournalModal } from "@/components/dca/DcaJournalModal";
import { appendDcaJournalEntry, type DcaJournalTrigger } from "@/lib/dcaJournal";
import { interactiveButton } from "@/lib/motion";
import { useAppStore } from "@/src/store/useAppStore";
import { formatUsd } from "@/lib/data";
import { RefreshCw, History, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface DcaEngineProps {
  portfolioSymbols?: string[];
  trackedAssets?: TrackedAsset[];
  portfolioHoldings?: Array<{
    symbol: string;
    category: AssetCategory;
    usdValue: number;
    roiPercent: number;
    hasPurchaseHistory: boolean;
  }>;
  dcaTransactions?: Transaction[];
  loading?: boolean;
  onRecordPurchase: (plans: TokenExecutionPlan[]) => boolean;
  onRecordMarketLeg?: (plan: TokenExecutionPlan) => boolean;
}

export function DcaEngine({
  portfolioSymbols = [],
  trackedAssets = [],
  portfolioHoldings = [],
  dcaTransactions = [],
  loading: externalLoading = false,
  onRecordPurchase,
  onRecordMarketLeg,
}: DcaEngineProps) {
  const [journalOpen, setJournalOpen] = useState(false);
  const weeklyAmount = useAppStore((state) => state.dcaPlan.weeklyBudget);
  const setWeeklyBudget = useAppStore((state) => state.setWeeklyBudget);
  const setDcaResult = useAppStore((state) => state.setDcaResult);
  const setExecutionPlans = useAppStore((state) => state.setExecutionPlans);
  const tradingMode = useAppStore((state) => state.tradingMode);
  const tokenTechnicals = useAppStore(
    (state) => state.globalLiveData.tokenTechnicals,
  );
  const { timing, loading: timingLoading, executionAllowed } =
    useSmartMondayTiming();

  const { snapshot, loading: engineLoading, refresh: refreshTokens } =
    useDcaEngine({
      portfolioSymbols,
      dcaTransactions,
    });

  const {
    result: liveResult,
    loading: liveLoading,
    refresh: refreshLive,
  } = useDcaLiveEngine({
    weeklyBudget: weeklyAmount,
    portfolioSymbols,
    dcaTransactions,
    tokenSnapshot: snapshot?.tokens,
  });

  const displayResult = liveResult;
  const loading =
    externalLoading ||
    engineLoading ||
    (liveLoading && !displayResult);

  const {
    bucketing,
    metricsLoading: bucketingMetricsLoading,
    metricsError: bucketingMetricsError,
    yieldMetrics,
    stakingApy,
  } = usePortfolioBucketing({
    deployedCapital: displayResult?.capitalPipeline.dDeployedCapital ?? 0,
    tokenPlans: displayResult?.tokenPlans ?? [],
    regime: displayResult?.macroRegime ?? "SIDEWAYS",
    regimeLabel: displayResult?.regimeLabel ?? "SIDEWAYS",
    finalScore: displayResult?.confluenceScore ?? 50,
    enabled: Boolean(displayResult),
  });

  const portfolioYieldContext = useMemo(
    () => buildPortfolioYieldContext({ holdings: portfolioHoldings }),
    [portfolioHoldings],
  );

  const finalExecutionOrders = useMemo(
    () =>
      displayResult && bucketing
        ? buildFinalExecutionOrders({
            bucketing,
            deployedCapital: displayResult.capitalPipeline.dDeployedCapital,
            finalScore: displayResult.confluenceScore,
            fearGreedValue: displayResult.fearGreedValue,
            brakeActive: displayResult.brakeActive,
            confidence: displayResult.confidence,
            tokenPlans: displayResult.tokenPlans,
            marketData: snapshot?.marketData ?? null,
            portfolioYieldContext,
            yieldMetrics,
            stakingApy,
            tokenTechnicals,
          })
        : [],
    [
      displayResult,
      bucketing,
      snapshot?.marketData,
      portfolioYieldContext,
      yieldMetrics,
      stakingApy,
      tokenTechnicals,
    ],
  );

  useEffect(() => {
    if (displayResult) {
      setDcaResult(displayResult);
      setExecutionPlans(finalExecutionOrders);
    }
  }, [displayResult, finalExecutionOrders, setDcaResult, setExecutionPlans]);

  const totalDeployed = displayResult?.capitalPipeline.dDeployedCapital ?? 0;

  const tokenPrices = useMemo(() => {
    const prices: Record<string, number> = {};
    for (const plan of displayResult?.tokenPlans ?? []) {
      if (plan.spotPrice > 0) prices[plan.symbol] = plan.spotPrice;
    }
    for (const plan of finalExecutionOrders) {
      if (plan.spotPrice > 0) prices[plan.symbol] = plan.spotPrice;
    }
    if (snapshot?.tokens) {
      for (const [symbol, token] of Object.entries(snapshot.tokens)) {
        if (token.price > 0) prices[symbol] = token.price;
      }
    }
    return prices;
  }, [displayResult?.tokenPlans, finalExecutionOrders, snapshot?.tokens]);

  const logExecutionPerformance = useCallback(
    async (plans: TokenExecutionPlan[]) => {
      if (plans.length === 0) return;
      const fearGreed = displayResult?.fearGreedValue ?? 50;
      const octagonSnapshots = await fetchAllTokenOctagonSnapshots(
        fearGreed,
        portfolioSymbols,
        trackedAssets,
      );
      const octagonScores = Object.fromEntries(
        Object.entries(octagonSnapshots).map(([symbol, snap]) => [
          symbol,
          snap?.accumulationScore ?? 0,
        ]),
      );
      const marketAvg7dBySymbol = Object.fromEntries(
        Object.entries(octagonSnapshots).map(([symbol, snap]) => [
          symbol,
          snap?.avgPrice7d ?? tokenPrices[symbol] ?? 0,
        ]),
      );
      appendExecutionPerformanceEntries(
        plans,
        octagonScores,
        marketAvg7dBySymbol,
      );
    },
    [displayResult?.fearGreedValue, portfolioSymbols, tokenPrices, trackedAssets],
  );

  const logSingleLegPerformance = useCallback(
    async (plan: TokenExecutionPlan, leg: OrderLeg) => {
      const fearGreed = displayResult?.fearGreedValue ?? 50;
      const octagonSnapshots = await fetchAllTokenOctagonSnapshots(
        fearGreed,
        portfolioSymbols,
        trackedAssets,
      );
      const snap = octagonSnapshots[plan.symbol as keyof typeof octagonSnapshots];
      appendSingleExecutionPerformanceEntry({
        plan,
        leg,
        octagonScore: snap?.accumulationScore ?? 0,
        marketAvg7d: snap?.avgPrice7d ?? plan.spotPrice,
      });
    },
    [displayResult?.fearGreedValue, portfolioSymbols, trackedAssets],
  );

  const handleDeployAll = useCallback(async () => {
    if (!displayResult) {
      throw new Error("DCA výsledok nie je pripravený");
    }

    if (tradingMode === "simulation") {
      appendTradeRound(
        createSimulatedTradeRound({
          totalInvestedUsd: totalDeployed,
          finalScore: displayResult.confluenceScore,
          regimeLabel: displayResult.regimeLabel,
          regimeKey: displayResult.regimeKey,
          plans: finalExecutionOrders,
        }),
      );
      void logExecutionPerformance(finalExecutionOrders);
      return;
    }

    const orders = buildExchangeExecuteOrders(finalExecutionOrders);
    const response = await fetch("/api/exchange/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders }),
    });
    const json = (await response.json()) as ExchangeExecuteResponse;

    if (!json.results || (!json.success && !json.totalExecutedUsd)) {
      throw new Error(json.error ?? "Live execution failed");
    }

    appendTradeRound(
      createTradeRound({
        mode: "live",
        totalInvestedUsd: json.totalExecutedUsd ?? totalDeployed,
        finalScore: displayResult.confluenceScore,
        regimeLabel: displayResult.regimeLabel,
        regimeKey: displayResult.regimeKey,
        results: json.results,
      }),
    );

    if (!json.success) {
      throw new Error(json.error ?? "Čiastočná exekúcia — skontroluj históriu");
    }

    void logExecutionPerformance(finalExecutionOrders);
  }, [displayResult, finalExecutionOrders, logExecutionPerformance, totalDeployed, tradingMode]);

  const handleDeployLeg = useCallback(
    async (symbol: string, leg: OrderLeg, plan: TokenExecutionPlan) => {
      if (tradingMode === "live") {
        const orders = buildExchangeExecuteOrders([plan]).filter(
          (order) => order.leg === leg,
        );
        if (orders.length === 0) return;

        const response = await fetch("/api/exchange/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders }),
        });
        const json = (await response.json()) as ExchangeExecuteResponse;
        if (!json.success) {
          throw new Error(json.error ?? "Order execution failed");
        }
      }

      if (leg === "market") {
        onRecordMarketLeg?.(plan);
      } else {
        registerOpenLimitOrder({
          symbol: plan.symbol,
          limitPrice: plan.limitPrice,
          limitUsd: plan.limitUsd,
          createdAt: new Date().toISOString(),
        });
        appendDcaJournalEntry({ plan, trigger: "activate_limit" });
      }

      void logSingleLegPerformance(plan, leg);
    },
    [logSingleLegPerformance, onRecordMarketLeg, tradingMode],
  );

  const handleCancelLimit = useCallback((symbol: string) => {
    cancelOpenLimitOrder(symbol);
  }, []);

  const handleJournalLimit = useCallback(
    (plan: TokenExecutionPlan, trigger: DcaJournalTrigger) => {
      appendDcaJournalEntry({ plan, trigger });
    },
    [],
  );

  const handleRecordPurchase = () => {
    const recorded = onRecordPurchase(finalExecutionOrders);
    if (recorded) {
      void logExecutionPerformance(finalExecutionOrders);
    }
  };

  const handleRefresh = () => {
    void refreshTokens();
    void refreshLive();
  };

  const allocationProps = displayResult
    ? {
        factors: displayResult.factors,
        confluenceScore: displayResult.confluenceScore,
        cashReserve: displayResult.capitalPipeline.eReserveCapital,
        weeklyCapital: displayResult.capitalPipeline.aWeeklyBudget,
        regimeLabel: displayResult.regimeLabel,
        baseAllocationPercent: displayResult.baseAllocationPercent,
        allocationPercent: displayResult.allocationPercent,
        dynamicAnchor: displayResult.dynamicAnchor,
        dynamicSlope: displayResult.dynamicSlope,
        confidence: displayResult.confidence,
        confidenceMultiplier: displayResult.confidenceMultiplier,
      }
    : null;

  return (
    <LayoutGroup>
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex items-center justify-between gap-3"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            DCA & Dynamic Execution
          </p>
          <h2 className="text-xl font-bold text-white">
            Master Dynamic Allocation
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <TradingModeToggle compact />
          <button
            type="button"
            onClick={() => setJournalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:text-white"
          >
            <History className="h-3.5 w-3.5" />
            DCA Denník
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
            aria-label="Obnoviť dáta"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </motion.div>

      {/* Extreme market alert — first content block below header, above Weekly Investment (A) */}
      {displayResult && (
        <ExtremeMarketAlertBanner
          finalScore={displayResult.confluenceScore}
          fearGreed={displayResult.fearGreedValue}
        />
      )}

      {/* A — Weekly investment + capital pipeline */}
      <motion.div layout className="space-y-6">
        <WeeklyInvestmentCard
          value={weeklyAmount}
          onChange={setWeeklyBudget}
          tradingMode={tradingMode}
        />
        {displayResult && allocationProps && (
          <MasterAllocationCard {...allocationProps} section="capital" />
        )}
      </motion.div>

      {displayResult && allocationProps && (
        <>
          {/* B — 5 scoring factors (VALUE, TREND, SENTIMENT…) */}
          <MasterAllocationCard {...allocationProps} section="factors" />

          {/* C — Trhový režim + Final Score + Alokácia */}
          <DcaMarketRegimeCard
            regimeLabel={displayResult.regimeLabel}
            regimeDescription={displayResult.regimeDescription}
            confluenceScore={displayResult.confluenceScore}
            allocationPercent={displayResult.allocationPercent}
            dynamicAnchor={displayResult.dynamicAnchor}
            dynamicSlope={displayResult.dynamicSlope}
            confidence={displayResult.confidence}
            confidenceMultiplier={displayResult.confidenceMultiplier}
            investmentAmount={displayResult.capitalPipeline.dDeployedCapital}
          />

          {/* D — 5 circular macro regime factors */}
          <MarketRegimeFactorPills />

          {/* E — Akumulačný Core bias (tri-color bar) */}
          <PortfolioBucketingCard
            bucketing={bucketing}
            loading={bucketingMetricsLoading}
            metricsError={bucketingMetricsError}
            section="macro"
          />

          {/* F — Token split + Yield filter + narratív */}
          <PortfolioBucketingCard
            bucketing={bucketing}
            loading={bucketingMetricsLoading}
            metricsError={bucketingMetricsError}
            section="tokens"
          />

          {/* Backtest — 12M strategy comparison (tesne pred exekúciou) */}
          <DcaBacktestModule
            finalScore={displayResult.confluenceScore}
            fearGreed={displayResult.fearGreedValue}
            regimeLabel={displayResult.regimeLabel}
            allocationPercent={displayResult.allocationPercent}
          />

          <ExecutionPerformanceSection
            fearGreed={displayResult.fearGreedValue}
            portfolioSymbols={portfolioSymbols}
            trackedAssets={trackedAssets}
            dcaTransactions={dcaTransactions}
            executionPlans={finalExecutionOrders}
            tokenPrices={tokenPrices}
          />

          {/* G — Execution engine */}
          <SmartMondayTimingBanner timing={timing} loading={timingLoading} />
          <ExecutionEngineCards
            finalExecutionOrders={finalExecutionOrders}
            deployedCapital={totalDeployed}
            loading={loading}
            tradingMode={tradingMode}
            executionAllowed={executionAllowed}
            yieldConvictionCount={bucketing?.yieldAltcoins.conviction.length ?? 0}
            yieldUniverseCount={bucketing?.yieldAltcoinCount ?? 0}
            onDeployAll={handleDeployAll}
            onDeployLeg={handleDeployLeg}
            onCancelLimit={handleCancelLimit}
            onJournalLimit={handleJournalLimit}
          />
        </>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-center"
      >
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Celková týždenná alokácia
        </p>
        <p className="mt-0.5 text-2xl font-bold text-emerald-400">
          {formatUsd(totalDeployed)}
        </p>
        {displayResult?.brakeActive && (
          <p className="mt-1 text-[10px] font-medium text-orange-400">
            Prah brzdy aktívny (+40 % nad 200WMA)
          </p>
        )}
      </motion.div>

      <motion.button
        type="button"
        onClick={handleRecordPurchase}
        disabled={loading || totalDeployed <= 0 || finalExecutionOrders.length === 0}
        {...interactiveButton}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-base font-bold text-emerald-400 shadow-[0_0_32px_rgba(52,211,153,0.18)] transition-colors hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ShoppingCart className="h-5 w-5" />
        Zaznamenať nákup
      </motion.button>

      <DcaJournalModal open={journalOpen} onClose={() => setJournalOpen(false)} />
    </div>
    </LayoutGroup>
  );
}
