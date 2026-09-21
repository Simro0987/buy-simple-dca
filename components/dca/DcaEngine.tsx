"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShoppingCart, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmPurchaseSheet } from "@/components/dca/ConfirmPurchaseSheet";
import { DcaActivityCard } from "@/components/dca/DcaActivityCard";
import { ExecutionEngineCards } from "@/components/dca/ExecutionEngineCards";
import { MarketRegimeFactors } from "@/components/dca/MarketRegimeFactors";
import { WeeklyInvestmentCard } from "@/components/dca/WeeklyInvestmentCard";
import {
  calculateWeeklyExecution,
  DEFAULT_WEEKLY_INVESTMENT,
  hasUsablePrices,
  readWeeklyInvestment,
  writeWeeklyInvestment,
  type TokenExecutionPlan,
} from "@/lib/dcaEngineConfig";
import type { CryptoPricesMap } from "@/lib/cryptoApi";
import type { Transaction } from "@/lib/portfolioStorage";
import { formatUsd } from "@/lib/data";

interface DcaEngineProps {
  prices?: CryptoPricesMap;
  loading?: boolean;
  priceError?: string | null;
  transactions?: Transaction[];
  onRecordPurchase: (plans: TokenExecutionPlan[]) => boolean;
}

export function DcaEngine({
  prices,
  loading = false,
  priceError = null,
  transactions = [],
  onRecordPurchase,
}: DcaEngineProps) {
  const [weeklyAmount, setWeeklyAmount] = useState(DEFAULT_WEEKLY_INVESTMENT);
  const [hydrated, setHydrated] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setWeeklyAmount(readWeeklyInvestment());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeWeeklyInvestment(weeklyAmount);
  }, [hydrated, weeklyAmount]);

  const executionPlans = useMemo(
    () => calculateWeeklyExecution(weeklyAmount),
    [weeklyAmount],
  );

  const totalDeployed = useMemo(
    () => executionPlans.reduce((sum, plan) => sum + plan.totalUsd, 0),
    [executionPlans],
  );

  const pricesReady = hasUsablePrices(prices);
  const canRecord = totalDeployed > 0 && pricesReady;
  const showPriceAlert = Boolean(priceError) && !pricesReady && !loading;

  const recordHint = !hydrated
    ? "Načítavam nastavenia…"
    : loading && !pricesReady
      ? "Načítavam live ceny…"
      : !pricesReady
        ? "Ceny nie sú dostupné — záznam je dočasne vypnutý."
        : totalDeployed <= 0
          ? "Zadaj týždennú sumu, aby sa dalo uložiť."
          : "Záznam pripočíta celú sumu do portfólia za live ceny.";

  const handleOpenConfirm = () => {
    if (!canRecord) return;
    setConfirmOpen(true);
  };

  const handleConfirmPurchase = () => {
    const recorded = onRecordPurchase(executionPlans);
    if (recorded) {
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex items-start justify-between gap-3"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            DCA & Dynamic Execution
          </p>
          <h2 className="text-xl font-bold text-white">Týždenný plán</h2>
          <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-zinc-500">
            Nastav sumu, skontroluj split a ulož nákup do portfólia.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
          <Zap className="h-3 w-3 fill-emerald-400" aria-hidden="true" />
          Money Mode
        </span>
      </motion.div>

      {showPriceAlert && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Ceny nie sú dostupné
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-200/70">
              Záznam nákupu je vypnutý, kým sa nenačítajú live ceny. Plán alokácie
              môžeš medzitým upraviť.
            </p>
          </div>
        </div>
      )}

      <WeeklyInvestmentCard
        value={weeklyAmount}
        onChange={setWeeklyAmount}
        plans={executionPlans}
      />

      <MarketRegimeFactors />

      <ExecutionEngineCards
        plans={executionPlans}
        prices={prices}
        loading={loading}
        pricesReady={pricesReady}
      />

      <DcaActivityCard transactions={transactions} />

      <div className="space-y-2">
        <p id="dca-record-hint" className="px-1 text-[11px] leading-relaxed text-zinc-500">
          {recordHint}
        </p>
        <motion.button
          type="button"
          onClick={handleOpenConfirm}
          disabled={!canRecord}
          aria-describedby="dca-record-hint"
          whileHover={canRecord ? { scale: 1.02 } : undefined}
          whileTap={canRecord ? { scale: 0.97 } : undefined}
          className="flex w-full items-center justify-center gap-2 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-base font-bold text-emerald-400 shadow-[0_0_32px_rgba(52,211,153,0.18)] transition-colors hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {canRecord
            ? `Zaznamenať nákup · ${formatUsd(totalDeployed)}`
            : "Zaznamenať nákup"}
        </motion.button>
      </div>

      <ConfirmPurchaseSheet
        open={confirmOpen}
        plans={executionPlans}
        prices={prices}
        totalUsd={totalDeployed}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmPurchase}
      />
    </div>
  );
}
