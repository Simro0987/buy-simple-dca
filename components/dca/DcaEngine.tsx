"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Toast, type ToastVariant } from "@/components/Toast";
import { useDcaHydrated } from "@/hooks/useDcaHydrated";
import { useDcaMarketData } from "@/hooks/useDcaMarketData";
import { useExecutionClock } from "@/hooks/useExecutionClock";
import { useRegimeMetrics } from "@/hooks/useRegimeMetrics";
import { buildWeeklyDcaPlan } from "@/lib/dca/allocation";
import {
  ledgerReserveImpact,
  type PortfolioAssetRecord,
} from "@/lib/dca/executionLedger";
import { glassPanel } from "@/lib/dca/glass";
import type { DcaSymbol, LimitLeg, TokenExecutionPlan } from "@/lib/dca/types";
import { formatUsd } from "@/lib/data";
import { portfolioHoldings } from "@/lib/data";
import type { Transaction } from "@/lib/portfolioStorage";
import { useCapitalStore } from "@/store/capitalStore";
import { useDcaStore } from "@/store/dcaStore";
import { useExecutionStore } from "@/store/executionStore";

interface DcaEngineProps {
  transactions?: Transaction[];
  onRecordPurchase: (
    plans: TokenExecutionPlan[],
    prices: Record<string, number>,
  ) => boolean;
  onExecutionFill?: (record: PortfolioAssetRecord) => boolean;
}

export function DcaEngine({
  transactions = [],
  onRecordPurchase,
  onExecutionFill,
}: DcaEngineProps) {
  const hydrated = useDcaHydrated();
  const baseAmount = useDcaStore((state) => state.baseAmount);
  const weeklyAmount = useDcaStore((state) => state.weeklyAmount);
  const lmt2MinUsd = useDcaStore((state) => state.lmt2MinUsd);
  const moneyMode = useDcaStore((state) => state.moneyMode);
  const allocationMode = useDcaStore((state) => state.allocationMode);
  const allocationOverride = useDcaStore((state) => state.allocationOverride);
  const ritualOpen = useDcaStore((state) => state.ritualOpen);
  const whyOpen = useDcaStore((state) => state.whyOpen);
  const setBaseAmount = useDcaStore((state) => state.setBaseAmount);
  const setLmt2MinUsd = useDcaStore((state) => state.setLmt2MinUsd);
  const toggleMoneyMode = useDcaStore((state) => state.toggleMoneyMode);
  const setAllocationMode = useDcaStore((state) => state.setAllocationMode);
  const setAllocationOverride = useDcaStore((state) => state.setAllocationOverride);
  const autoFill = useDcaStore((state) => state.autoFill);
  const setRitualOpen = useDcaStore((state) => state.setRitualOpen);
  const setWhyOpen = useDcaStore((state) => state.setWhyOpen);
  const setPipeline = useCapitalStore((state) => state.setPipeline);

  const nowMs = useExecutionClock();
  const pendingOrders = useExecutionStore((state) => state.pending_orders);
  const portfolioAssets = useExecutionStore((state) => state.portfolio_assets);
  const activateMarket = useExecutionStore((state) => state.activateMarket);
  const activateLimit = useExecutionStore((state) => state.activateLimit);
  const fillPending = useExecutionStore((state) => state.fillPending);
  const cancelPending = useExecutionStore((state) => state.cancelPending);
  const pendingFor = useExecutionStore((state) => state.pendingFor);
  const marketFillThisWeek = useExecutionStore((state) => state.marketFillThisWeek);
  const limitFillThisWeek = useExecutionStore((state) => state.limitFillThisWeek);

  const { snapshots, loading, error, pricesReady } = useDcaMarketData();
  const { metrics: regimeMetrics, loading: regimeLoading } = useRegimeMetrics();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);

  const weeklyPlan = useMemo(
    () =>
      buildWeeklyDcaPlan({
        weeklyAmount: baseAmount || weeklyAmount,
        moneyMode,
        allocationMode,
        snapshots,
        regimeMetrics,
        minLmt2Usd: lmt2MinUsd,
        allocationOverride,
      }),
    [baseAmount, weeklyAmount, moneyMode, allocationMode, snapshots, regimeMetrics, lmt2MinUsd, allocationOverride],
  );

  useEffect(() => {
    setPipeline({
      baseAmount: weeklyPlan.baseAmount,
      deploymentScore: weeklyPlan.deploymentScore,
      allocationPercent: weeklyPlan.allocationPercent,
      deployedCapital: weeklyPlan.deployedCapital,
      undeployedToReserve: weeklyPlan.undeployedToReserve,
      confluence: weeklyPlan.confluence,
      basketSplits: weeklyPlan.basketSplits,
      finalBudgets: weeklyPlan.finalBudgets,
    });
  }, [setPipeline, weeklyPlan]);

  const planBySymbol = useMemo(() => {
    const map = new Map<DcaSymbol, TokenExecutionPlan>();
    for (const plan of weeklyPlan.plans) map.set(plan.symbol, plan);
    return map;
  }, [weeklyPlan.plans]);

  const executionImpactUsd = ledgerReserveImpact({
    portfolio_assets: portfolioAssets,
    pending_orders: pendingOrders,
  });

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

  function handleCopied(message: string) {
    setToast({ message, variant: message === "Skopírované!" ? "success" : "error" });
  }

  function handleActivateMarket(symbol: DcaSymbol) {
    const plan = planBySymbol.get(symbol);
    if (!plan) return;
    const record = activateMarket(plan, plan.price);
    if (!record) {
      setToast({ message: "Market sa nepodarilo aktivovať", variant: "error" });
      return;
    }
    onExecutionFill?.(record);
    setToast({ message: "Market zrealizovaný", variant: "success" });
  }

  function handleActivateLimit(symbol: DcaSymbol, leg: LimitLeg = "lmt1") {
    const plan = planBySymbol.get(symbol);
    if (!plan) return;
    const order = activateLimit(plan, leg);
    if (!order) {
      setToast({ message: "Limit sa nepodarilo aktivovať", variant: "error" });
      return;
    }
    setToast({
      message: `${leg === "lmt2" ? "LMT2" : "LMT1"} aktivovaný · PRICE LOCK`,
      variant: "success",
    });
  }

  function handleFillPending(id: string) {
    const record = fillPending(id);
    if (!record) return;
    onExecutionFill?.(record);
    setToast({ message: "Limit zrealizovaný", variant: "success" });
  }

  function handleCancelPending(id: string) {
    const order = cancelPending(id);
    if (!order) return;
    setToast({
      message: "Limit zrušený · kapitál vrátený do rezervy",
      variant: "success",
    });
  }

  return (
    <div className="space-y-5">
      <DcaPlanHeader
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

      <WeeklyInvestmentCard
        value={baseAmount || weeklyAmount}
        onChange={setBaseAmount}
        moneyMode={moneyMode}
        onToggleMoneyMode={toggleMoneyMode}
        lmt2MinUsd={lmt2MinUsd}
        onLmt2MinUsd={setLmt2MinUsd}
      />
      <MarketRegimePanel
        regime={weeklyPlan.regime}
        baseAmount={weeklyPlan.baseAmount}
        deployedCapital={weeklyPlan.deployedCapital}
        undeployedToReserve={weeklyPlan.undeployedToReserve}
        engineAllocationPercent={weeklyPlan.engineAllocationPercent}
        allocationOverride={allocationOverride}
        onAllocationChange={setAllocationOverride}
        onResetAllocation={() => setAllocationOverride(null)}
        loading={(loading && !pricesReady) || regimeLoading}
      />
      <AllocationRulesCard
        plan={weeklyPlan}
        cashReserveUsd={portfolioHoldings.cashUsd}
        executionImpactUsd={executionImpactUsd}
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
            Token karty · MKT / LMT1 / LMT2
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
                pendingLimit={pendingFor(plan.symbol, "lmt1") ?? null}
                pendingLimit2={pendingFor(plan.symbol, "lmt2") ?? null}
                marketFill={marketFillThisWeek(plan.symbol) ?? null}
                limitFill={limitFillThisWeek(plan.symbol, "lmt1") ?? null}
                limitFill2={limitFillThisWeek(plan.symbol, "lmt2") ?? null}
                nowMs={nowMs}
                onCopied={handleCopied}
                onActivateMarket={handleActivateMarket}
                onActivateLimit={handleActivateLimit}
                onFillPending={handleFillPending}
                onCancelPending={handleCancelPending}
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

      <DcaActivityCard
        transactions={transactions}
        pendingOrders={pendingOrders}
        nowMs={nowMs}
      />

      <RitualSheet
        open={ritualOpen}
        plans={weeklyPlan.plans}
        pendingOrders={pendingOrders}
        portfolioAssets={portfolioAssets}
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
      <Toast
        message={toast?.message ?? ""}
        visible={Boolean(toast)}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
