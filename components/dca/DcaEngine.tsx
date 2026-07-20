"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, ShoppingCart } from "lucide-react";
import { useMemo } from "react";
import { DcaAllocationAccordion } from "@/components/dca/DcaAllocationAccordion";
import { DcaHeroDashboard } from "@/components/dca/DcaHeroDashboard";
import { ExecutionEngineCards } from "@/components/dca/ExecutionEngineCards";
import { FactorPills } from "@/components/dca/FactorPills";
import { WeeklyInvestmentCard } from "@/components/dca/WeeklyInvestmentCard";
import { useDcaEngine } from "@/hooks/useDcaEngine";
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

  const { result, loading: engineLoading, error, refresh } = useDcaEngine({
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
            DCA Execution Engine
          </h2>
        </div>
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

      <WeeklyInvestmentCard
        value={weeklyAmount}
        onChange={setWeeklyBudget}
      />

      {result && (
        <>
          <DcaHeroDashboard
            regimeLabel={result.regimeLabel}
            regimeDescription={result.regimeDescription}
            moneyMode={result.regimeLabel}
            confluenceScore={result.confluenceScore}
            baseAllocationPercent={result.baseAllocationPercent}
            allocationPercent={result.allocationPercent}
            confidence={result.confidence}
            confidenceMultiplier={result.confidenceMultiplier}
            investmentAmount={result.capitalPipeline.dDeployedCapital}
          />

          <FactorPills
            factors={result.factors}
            confluenceScore={result.confluenceScore}
          />

          <DcaAllocationAccordion
            pipeline={result.capitalPipeline}
            confidenceMultiplier={result.confidenceMultiplier}
            factors={result.factors}
            confluenceScore={result.confluenceScore}
            advisor={result.advisor}
            loading={loading}
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
