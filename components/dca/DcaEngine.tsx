"use client";

import { motion } from "framer-motion";
import { ShoppingCart, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { ExecutionEngineCards } from "@/components/dca/ExecutionEngineCards";
import { MarketRegimeFactors } from "@/components/dca/MarketRegimeFactors";
import { WeeklyInvestmentCard } from "@/components/dca/WeeklyInvestmentCard";
import {
  calculateWeeklyExecution,
  DEFAULT_WEEKLY_INVESTMENT,
  type TokenExecutionPlan,
} from "@/lib/dcaEngineConfig";
import type { CryptoPricesMap } from "@/lib/cryptoApi";
import { interactiveButton } from "@/lib/motion";

interface DcaEngineProps {
  prices?: CryptoPricesMap;
  loading?: boolean;
  onRecordPurchase: (plans: TokenExecutionPlan[]) => boolean;
}

export function DcaEngine({
  prices,
  loading = false,
  onRecordPurchase,
}: DcaEngineProps) {
  const [weeklyAmount, setWeeklyAmount] = useState(DEFAULT_WEEKLY_INVESTMENT);

  const executionPlans = useMemo(
    () => calculateWeeklyExecution(weeklyAmount),
    [weeklyAmount],
  );

  const totalDeployed = useMemo(
    () => executionPlans.reduce((sum, plan) => sum + plan.totalUsd, 0),
    [executionPlans],
  );

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
          <h2 className="text-xl font-bold text-white">Execution Engine</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
          <Zap className="h-3 w-3 fill-emerald-400" />
          Money Mode
        </span>
      </motion.div>

      <WeeklyInvestmentCard value={weeklyAmount} onChange={setWeeklyAmount} />

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
      </motion.div>

      <MarketRegimeFactors />
      <ExecutionEngineCards
        plans={executionPlans}
        prices={prices}
        loading={loading}
      />

      <motion.button
        type="button"
        onClick={handleRecordPurchase}
        disabled={loading || totalDeployed <= 0}
        {...interactiveButton}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-base font-bold text-emerald-400 shadow-[0_0_32px_rgba(52,211,153,0.18)] transition-colors hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ShoppingCart className="h-5 w-5" />
        Zaznamenať nákup
      </motion.button>
    </div>
  );
}
