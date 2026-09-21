"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { AllocationRulesCard } from "@/components/dca/AllocationRulesCard";
import { ConfirmPurchaseSheet } from "@/components/dca/ConfirmPurchaseSheet";
import { DcaActivityCard } from "@/components/dca/DcaActivityCard";
import { DcaPlanHeader } from "@/components/dca/DcaPlanHeader";
import { MarketRegimePanel } from "@/components/dca/MarketRegimePanel";
import { PortfolioSplitSection } from "@/components/dca/PortfolioSplitSection";
import { RitualSheet } from "@/components/dca/RitualSheet";
import { TokenAllocationBoard } from "@/components/dca/TokenAllocationBoard";
import { TokenExecutionCard } from "@/components/dca/TokenExecutionCard";
import { WeeklyInvestmentCard } from "@/components/dca/WeeklyInvestmentCard";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { useDcaHydrated } from "@/hooks/useDcaHydrated";
import { useDcaMarketData } from "@/hooks/useDcaMarketData";
import { buildWeeklyDcaPlan } from "@/lib/dca/allocation";
import { glassPanel } from "@/lib/dca/glass";
import type { TokenExecutionPlan } from "@/lib/dca/types";
import { formatUsd } from "@/lib/data";
import { portfolioHoldings } from "@/lib/data";
import type { Transaction } from "@/lib/portfolioStorage";
import { useDcaStore } from "@/store/dcaStore";

interface DcaEngineProps {
  transactions?: Transaction[];
  onRecordPurchase: (
    plans: TokenExecutionPlan[],
    prices: Record<string, number>,
  ) => boolean;
}

export function DcaEngine({
  transactions = [],
  onRecordPurchase,
}: DcaEngineProps) {
  const hydrated = useDcaHydrated();
  const weeklyAmount = useDcaStore((state) => state.weeklyAmount);
  const moneyMode = useDcaStore((state) => state.moneyMode);
  const allocationMode = useDcaStore((state) => state.allocationMode);
  const ritualOpen = useDcaStore((state) => state.ritualOpen);
  const whyOpen = useDcaStore((state) => state.whyOpen);
  const activations = useDcaStore((state) => state.activations);
  const setWeeklyAmount = useDcaStore((state) => state.setWeeklyAmount);
  const toggleMoneyMode = useDcaStore((state) => state.toggleMoneyMode);
  const setAllocationMode = useDcaStore((state) => state.setAllocationMode);
  const autoFill = useDcaStore((state) => state.autoFill);
  const setRitualOpen = useDcaStore((state) => state.setRitualOpen);
  const setWhyOpen = useDcaStore((state) => state.setWhyOpen);
  const toggleActivation = useDcaStore((state) => state.toggleActivation);

  const { snapshots, loading, error, pricesReady } = useDcaMarketData();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const weeklyPlan = useMemo(
    () =>
      buildWeeklyDcaPlan({
        weeklyAmount,
        moneyMode,
        allocationMode,
        snapshots,
      }),
    [weeklyAmount, moneyMode, allocationMode, snapshots],
  );

  const payablePlans = weeklyPlan.plans.filter(
    (plan) =>
      plan.totalUsd > 0 &&
      !(plan.highBeta && !plan.highBeta.approved) &&
      !(plan.satellite && !plan.satellite.approved),
  );
  const livePrices = useMemo(() => {
    const map: Record<string, number> = {};
    for (const plan of weeklyPlan.plans) {
      if (plan.price > 0) map[plan.symbol] = plan.price;
    }
    return map;
  }, [weeklyPlan.plans]);

  const canRecord =
    payablePlans.length > 0 &&
    pricesReady &&
    payablePlans.every((plan) => (livePrices[plan.symbol] ?? 0) > 0);

  const recordHint = !hydrated
    ? "Načítavam nastavenia…"
    : loading && !pricesReady
      ? "Načítavam live dáta z Binance…"
      : !pricesReady
        ? "Ceny nie sú dostupné — záznam je dočasne vypnutý."
        : payablePlans.length === 0
          ? "Zadaj týždennú sumu, aby sa dalo uložiť."
          : "Záznam uloží nákup do portfólia. Príkazy na burze zadávaš ručne.";

  return (
    <div className="space-y-5">
      <DcaPlanHeader
        moneyMode={moneyMode}
        onToggleMoneyMode={toggleMoneyMode}
        onRitual={() => setRitualOpen(true)}
        onAutoFill={autoFill}
      />

      {error && !pricesReady && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Trhové dáta nie sú dostupné
            </p>
            <p className="mt-0.5 text-xs text-amber-200/70">
              Skúsim znova cez Binance REST. WebSocket tickery sa pripoja, keď to
              sieť dovolí.
            </p>
          </div>
        </div>
      )}

      <WeeklyInvestmentCard value={weeklyAmount} onChange={setWeeklyAmount} />
      <MarketRegimePanel regime={weeklyPlan.regime} loading={loading && !pricesReady} />
      <AllocationRulesCard
        plan={weeklyPlan}
        cashReserveUsd={portfolioHoldings.cashUsd}
        whyOpen={whyOpen}
        onToggleWhy={() => setWhyOpen(!whyOpen)}
      />
      <PortfolioSplitSection
        plan={weeklyPlan}
        allocationMode={allocationMode}
        onAllocationMode={setAllocationMode}
      />
      <TokenAllocationBoard plan={weeklyPlan} />

      <section className="space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Týždenná exekúcia
          </p>
          <h3 className="mt-1 text-sm font-bold text-white">
            Token karty · plynulý MKT / LMT split
          </h3>
        </div>
        {loading && !pricesReady ? (
          <div className={`${glassPanel} space-y-3 p-4`}>
            <PriceSkeleton className="h-6 w-40" />
            <PriceSkeleton className="h-24 w-full" />
            <PriceSkeleton className="h-24 w-full" />
          </div>
        ) : (
          weeklyPlan.plans
            .filter(
              (plan) =>
                plan.totalUsd > 0 ||
                plan.symbol === "BTC" ||
                plan.category === "HIGH_BETA" ||
                plan.category === "SATELLITE",
            )
            .map((plan) => (
              <TokenExecutionCard
                key={plan.symbol}
                plan={plan}
                loading={loading}
                marketActive={activations[plan.symbol]?.market}
                limitActive={activations[plan.symbol]?.limit}
                onActivateMarket={(symbol) => toggleActivation(symbol, "market")}
                onActivateLimit={(symbol) => toggleActivation(symbol, "limit")}
              />
            ))
        )}
      </section>

      <div className="space-y-2">
        <p id="dca-record-hint" className="px-1 text-[11px] leading-relaxed text-zinc-500">
          {recordHint}
        </p>
        <motion.button
          type="button"
          onClick={() => canRecord && setConfirmOpen(true)}
          disabled={!canRecord}
          aria-describedby="dca-record-hint"
          className="flex w-full items-center justify-center gap-2 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-base font-bold text-emerald-400 shadow-[0_0_32px_rgba(52,211,153,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {canRecord
            ? `Zaznamenať nákup · ${formatUsd(weeklyPlan.deployedUsd)}`
            : "Zaznamenať nákup"}
        </motion.button>
      </div>

      <DcaActivityCard transactions={transactions} />

      <RitualSheet
        open={ritualOpen}
        plans={weeklyPlan.plans}
        activations={activations}
        onClose={() => setRitualOpen(false)}
      />
      <ConfirmPurchaseSheet
        open={confirmOpen}
        plans={payablePlans}
        totalUsd={weeklyPlan.deployedUsd}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          const recorded = onRecordPurchase(payablePlans, livePrices);
          if (recorded) setConfirmOpen(false);
        }}
      />
    </div>
  );
}
