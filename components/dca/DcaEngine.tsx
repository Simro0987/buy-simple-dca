"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, ShoppingCart, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { CapitalPipelineSection } from "@/components/dca/CapitalPipelineSection";
import { ExecutionEngineCards } from "@/components/dca/ExecutionEngineCards";
import { ExecutionPerformanceSection } from "@/components/dca/ExecutionPerformanceSection";
import { FactorPills } from "@/components/dca/FactorPills";
import { MarketRegimeFactors } from "@/components/dca/MarketRegimeFactors";
import { MarketRegimeSection } from "@/components/dca/MarketRegimeSection";
import { MoneyModeHeader } from "@/components/dca/MoneyModeHeader";
import { WeeklyInvestmentCard } from "@/components/dca/WeeklyInvestmentCard";
import { useDcaEngine } from "@/hooks/useDcaEngine";
import {
  DEFAULT_WEEKLY_INVESTMENT,
  type TokenExecutionPlan,
} from "@/lib/dcaEngineConfig";
import { toExecutionPlans } from "@/lib/masterDcaEngine";
import type { Transaction } from "@/lib/portfolioStorage";
import { interactiveButton } from "@/lib/motion";

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
  const [weeklyAmount, setWeeklyAmount] = useState(DEFAULT_WEEKLY_INVESTMENT);

  const { result, loading: engineLoading, error, refresh } = useDcaEngine({
    weeklyBudget: weeklyAmount,
    portfolioSymbols,
    dcaTransactions,
  });

  const loading = externalLoading || engineLoading;

  const executionPlans = useMemo(
    () => (result ? toExecutionPlans(result) : []),
    [result],
  );

  const totalDeployed = result?.capitalPipeline.dDeployedCapital ?? 0;

  const handleRecordPurchase = () => {
    onRecordPurchase(executionPlans);
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
            Master DCA Engine
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
            aria-label="Obnoviť dáta"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
            <Zap className="h-3 w-3 fill-emerald-400" />
            Money Mode
          </span>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error} — používajú sa fallback dáta.
        </div>
      )}

      {result?.degraded && !error && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          API Degraded — zobrazujú sa cached / statické hodnoty.
        </div>
      )}

      <WeeklyInvestmentCard value={weeklyAmount} onChange={setWeeklyAmount} />

      {result && (
        <>
          <MoneyModeHeader
            mode={result.moneyMode}
            score={result.confluenceScore}
          />

          <MarketRegimeSection
            label={result.regimeLabel}
            description={result.regimeDescription}
            finalScore={result.confluenceScore}
            allocationPercent={result.allocationPercent}
            investmentAmount={result.capitalPipeline.dDeployedCapital}
          />

          <CapitalPipelineSection
            pipeline={result.capitalPipeline}
            confidenceMultiplier={result.confidenceMultiplier}
          />

          <MarketRegimeFactors
            factors={result.factors}
            confluenceScore={result.confluenceScore}
            loading={loading}
          />

          <FactorPills
            factors={result.factors.map((f) => ({
              name: f.name,
              score: f.score,
              status: f.status,
            }))}
          />

          <ExecutionEngineCards plans={executionPlans} loading={loading} />

          <ExecutionPerformanceSection advisor={result.advisor} />
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
        {result?.brakeActive && (
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
