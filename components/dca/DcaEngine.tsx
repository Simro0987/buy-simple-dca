"use client";

import { motion } from "framer-motion";
import { RefreshCw, ShoppingCart } from "lucide-react";
import { useEffect, useMemo } from "react";
import { DcaHeroDashboard } from "@/components/dca/DcaHeroDashboard";
import { ExecutionEngineCards } from "@/components/dca/ExecutionEngineCards";
import { MarketRegimeFactorPills } from "@/components/dca/MarketRegimeFactorPills";
import { MasterAllocationCard } from "@/components/dca/MasterAllocationCard";
import { PortfolioBucketingCard } from "@/components/dca/PortfolioBucketingCard";
import { usePortfolioBucketing } from "@/hooks/usePortfolioBucketing";
import { WeeklyInvestmentCard } from "@/components/dca/WeeklyInvestmentCard";
import { useDcaEngine } from "@/hooks/useDcaEngine";
import { useDcaLiveEngine } from "@/hooks/useDcaLiveEngine";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { toExecutionPlans } from "@/lib/masterDcaEngine";
import type { Transaction } from "@/lib/portfolioStorage";
import { interactiveButton } from "@/lib/motion";
import { useAppStore } from "@/src/store/useAppStore";

interface DcaEngineProps {
  portfolioSymbols?: string[];
  dcaTransactions?: Transaction[];
  loading?: boolean;
  onRecordPurchase: (plans: TokenExecutionPlan[]) => boolean;
}

export function DcaEngine({
  portfolioSymbols = [],
  dcaTransactions = [],
  loading: externalLoading = false,
  onRecordPurchase,
}: DcaEngineProps) {
  const weeklyAmount = useAppStore((state) => state.dcaPlan.weeklyBudget);
  const setWeeklyBudget = useAppStore((state) => state.setWeeklyBudget);
  const setDcaResult = useAppStore((state) => state.setDcaResult);
  const setExecutionPlans = useAppStore((state) => state.setExecutionPlans);

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

  const loading = externalLoading || engineLoading || liveLoading;
  const displayResult = liveResult;

  useEffect(() => {
    if (displayResult) {
      setDcaResult(displayResult);
      setExecutionPlans(toExecutionPlans(displayResult));
    }
  }, [displayResult, setDcaResult, setExecutionPlans]);

  const executionPlans = useMemo(
    () => (displayResult ? toExecutionPlans(displayResult) : []),
    [displayResult],
  );

  const {
    bucketing,
    metricsLoading: bucketingMetricsLoading,
    metricsError: bucketingMetricsError,
  } = usePortfolioBucketing({
    deployedCapital: displayResult?.capitalPipeline.dDeployedCapital ?? 0,
    tokenPlans: displayResult?.tokenPlans ?? [],
    regime: displayResult?.macroRegime ?? "SIDEWAYS",
    regimeLabel: displayResult?.regimeLabel ?? "SIDEWAYS",
    finalScore: displayResult?.confluenceScore ?? 50,
    enabled: Boolean(displayResult),
  });

  const totalDeployed = displayResult?.capitalPipeline.dDeployedCapital ?? 0;

  const handleRecordPurchase = () => {
    onRecordPurchase(executionPlans);
  };

  const handleRefresh = () => {
    void refreshTokens();
    void refreshLive();
  };

  return (
    <div className="space-y-5">
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
      </motion.div>

      <WeeklyInvestmentCard
        value={weeklyAmount}
        onChange={setWeeklyBudget}
      />

      {displayResult && (
        <>
          <DcaHeroDashboard
            regimeLabel={displayResult.regimeLabel}
            regimeDescription={displayResult.regimeDescription}
            moneyMode={displayResult.regimeLabel}
            confluenceScore={displayResult.confluenceScore}
            baseAllocationPercent={displayResult.baseAllocationPercent}
            allocationPercent={displayResult.allocationPercent}
            dynamicAnchor={displayResult.dynamicAnchor}
            dynamicSlope={displayResult.dynamicSlope}
            confidence={displayResult.confidence}
            confidenceMultiplier={displayResult.confidenceMultiplier}
            investmentAmount={displayResult.capitalPipeline.dDeployedCapital}
          />

          <MarketRegimeFactorPills
            snapshot={snapshot}
            loading={engineLoading}
          />

          <PortfolioBucketingCard
            bucketing={bucketing}
            loading={bucketingMetricsLoading}
            metricsError={bucketingMetricsError}
          />

          <MasterAllocationCard
            factors={displayResult.factors}
            confluenceScore={displayResult.confluenceScore}
            cashReserve={displayResult.capitalPipeline.eReserveCapital}
            weeklyCapital={displayResult.capitalPipeline.aWeeklyBudget}
            regimeLabel={displayResult.regimeLabel}
            baseAllocationPercent={displayResult.baseAllocationPercent}
            allocationPercent={displayResult.allocationPercent}
            dynamicAnchor={displayResult.dynamicAnchor}
            dynamicSlope={displayResult.dynamicSlope}
            confidence={displayResult.confidence}
            confidenceMultiplier={displayResult.confidenceMultiplier}
          />

          <ExecutionEngineCards plans={executionPlans} loading={loading} />
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
          ${totalDeployed.toFixed(2)}
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
        disabled={loading || totalDeployed <= 0 || executionPlans.length === 0}
        {...interactiveButton}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-base font-bold text-emerald-400 shadow-[0_0_32px_rgba(52,211,153,0.18)] transition-colors hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ShoppingCart className="h-5 w-5" />
        Zaznamenať nákup
      </motion.button>
    </div>
  );
}
