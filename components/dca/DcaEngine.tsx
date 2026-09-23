"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmPurchaseSheet } from "@/components/dca/ConfirmPurchaseSheet";
import { DcaActivityCard } from "@/components/dca/DcaActivityCard";
import { DcaPlanHeader } from "@/components/dca/DcaPlanHeader";
import { FlashCrashBanner } from "@/components/dca/FlashCrashBanner";
import { MarketRegimePanel } from "@/components/dca/MarketRegimePanel";
import { PhaseSplitCard } from "@/components/dca/PhaseSplitCard";
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
import { computeAvailableCapital } from "@/lib/dca/capitalPool";
import {
  ledgerReserveImpact,
  type PortfolioAssetRecord,
} from "@/lib/dca/executionLedger";
import { nextKnifeLatches } from "@/lib/dca/fallingKnife";
import { buildFlashCrashPlan } from "@/lib/dca/flashCrash";
import { glassPanel } from "@/lib/dca/glass";
import type { DcaSymbol, LimitLeg, TokenExecutionPlan } from "@/lib/dca/types";
import { formatUsd } from "@/lib/data";
import { portfolioHoldings } from "@/lib/data";
import type { Transaction } from "@/lib/portfolioStorage";
import { useCapitalStore } from "@/store/capitalStore";
import { useDcaStore } from "@/store/dcaStore";
import { useExecutionStore } from "@/store/executionStore";
import { useKnifeStore } from "@/store/knifeStore";
import { useLiveClockStore } from "@/store/liveClockStore";

interface DcaEngineProps {
  transactions?: Transaction[];
  holdings?: Partial<Record<string, number>>;
  onRecordPurchase: (
    plans: TokenExecutionPlan[],
    prices: Record<string, number>,
  ) => boolean;
  onExecutionFill?: (record: PortfolioAssetRecord) => boolean;
}

export function DcaEngine({
  transactions = [],
  holdings = {},
  onRecordPurchase,
  onExecutionFill,
}: DcaEngineProps) {
  const hydrated = useDcaHydrated();
  const baseAmount = useDcaStore((state) => state.baseAmount);
  const weeklyAmount = useDcaStore((state) => state.weeklyAmount);
  const moneyMode = useDcaStore((state) => state.moneyMode);
  const allocationMode = useDcaStore((state) => state.allocationMode);
  const allocationOverride = useDcaStore((state) => state.allocationOverride);
  const ritualOpen = useDcaStore((state) => state.ritualOpen);
  const sim = useDcaStore((state) => state.sim);
  const setBaseAmount = useDcaStore((state) => state.setBaseAmount);
  const toggleMoneyMode = useDcaStore((state) => state.toggleMoneyMode);
  const setAllocationMode = useDcaStore((state) => state.setAllocationMode);
  const setAllocationOverride = useDcaStore((state) => state.setAllocationOverride);
  const autoFill = useDcaStore((state) => state.autoFill);
  const setRitualOpen = useDcaStore((state) => state.setRitualOpen);
  const setSim = useDcaStore((state) => state.setSim);
  const setPipeline = useCapitalStore((state) => state.setPipeline);
  const knifeLatched = useKnifeStore((state) => state.latched);
  const setKnifeLatched = useKnifeStore((state) => state.setLatched);
  const touchClock = useLiveClockStore((state) => state.touch);
  const setConnected = useLiveClockStore((state) => state.setConnected);

  const nowMs = useExecutionClock();
  const pendingOrders = useExecutionStore((state) => state.pending_orders);
  const portfolioAssets = useExecutionStore((state) => state.portfolio_assets);
  const activateMarket = useExecutionStore((state) => state.activateMarket);
  const spendAvailableCapital = useExecutionStore((state) => state.spendAvailableCapital);
  const activateLimit = useExecutionStore((state) => state.activateLimit);
  const fillPending = useExecutionStore((state) => state.fillPending);
  const cancelPending = useExecutionStore((state) => state.cancelPending);
  const pendingFor = useExecutionStore((state) => state.pendingFor);
  const marketFillThisWeek = useExecutionStore((state) => state.marketFillThisWeek);
  const limitFillThisWeek = useExecutionStore((state) => state.limitFillThisWeek);

  const { snapshots, loading, error, pricesReady, live } = useDcaMarketData();
  const { metrics: regimeMetrics, loading: regimeLoading } = useRegimeMetrics();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [flashActivated, setFlashActivated] = useState(false);
  const [flashLock, setFlashLock] = useState(false);
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
        allocationOverride,
        knifeLatched,
        sim,
        holdings,
      }),
    [baseAmount, weeklyAmount, moneyMode, allocationMode, snapshots, regimeMetrics, allocationOverride, knifeLatched, sim, holdings],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("sim");
    if (raw === "flash" || raw === "trim" || raw === "knife" || raw === "off") {
      setSim(raw);
    }
  }, [setSim]);

  useEffect(() => {
    setConnected(live && pricesReady);
    if (pricesReady) touchClock(live && pricesReady);
  }, [live, pricesReady, setConnected, touchClock]);

  useEffect(() => {
    touchClock();
  }, [baseAmount, weeklyAmount, touchClock]);

  useEffect(() => {
    const next = nextKnifeLatches(
      knifeLatched,
      weeklyPlan.plans.map((plan) => ({
        symbol: plan.symbol,
        shouldLatch: plan.fallingKnife,
        shouldClear: !plan.fallingKnife && Boolean(knifeLatched[plan.symbol]),
      })),
    );
    if (JSON.stringify(next) !== JSON.stringify(knifeLatched)) {
      setKnifeLatched(next);
    }
  }, [weeklyPlan.plans, knifeLatched, setKnifeLatched]);

  useEffect(() => {
    setPipeline({
      baseAmount: weeklyPlan.baseAmount,
      deploymentScore: weeklyPlan.deploymentScore,
      allocationPercent: weeklyPlan.allocationPercent,
      deployedCapital: weeklyPlan.deployedCapital,
      undeployedToReserve: weeklyPlan.undeployedToReserve,
      availableCapital: weeklyPlan.availableCapital,
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
  const availableCapital = computeAvailableCapital({
    undeployedUsd: weeklyPlan.undeployedToReserve,
    leftoverWaterfallUsd: weeklyPlan.leftoverWaterfallUsd,
    brakeBoostReserveDelta: weeklyPlan.brakeBoostReserveDelta,
    cashUsd: portfolioHoldings.cashUsd,
    executionImpactUsd,
  });
  const flashCrash = buildFlashCrashPlan({
    active: weeklyPlan.flashCrash.active,
    availableCapital,
    plans: weeklyPlan.plans,
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
      message: "LMT aktivovaný · Čaká na burze (7d)",
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
      message: "Limit zrušený · kapitál vrátený do Dostupný Kapitál",
      variant: "success",
    });
  }

  return (
    <div
      className={`space-y-5 ${
        flashCrash.active
          ? "rounded-[2rem] border border-rose-400/40 p-1 shadow-[0_0_40px_rgba(244,63,94,0.22)]"
          : ""
      }`}
    >
      <DcaPlanHeader
        onRitual={() => {
          touchClock();
          setRitualOpen(true);
        }}
        onAutoFill={() => {
          touchClock();
          autoFill();
        }}
        sim={sim}
        onSim={setSim}
      />
      {flashCrash.active && (
        <FlashCrashBanner
          plan={flashCrash}
          activated={flashActivated}
          activating={flashLock}
          onActivate={() => {
            if (flashLock || flashActivated) return;
            setFlashLock(true);
            let filled = 0;
            for (const target of flashCrash.targets) {
              const record = spendAvailableCapital(target.symbol, target.usd, target.price);
              if (record) {
                onExecutionFill?.(record);
                filled += 1;
              }
            }
            setFlashActivated(filled > 0);
            setFlashLock(false);
            setToast({
              message: filled > 0 ? "Flash Crash nákup zrealizovaný" : "Flash Crash sa nepodarilo aktivovať",
              variant: filled > 0 ? "success" : "error",
            });
          }}
        />
      )}

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
      <PhaseSplitCard
        plan={weeklyPlan}
        allocationMode={allocationMode}
        onAllocationMode={setAllocationMode}
        cashReserveUsd={portfolioHoldings.cashUsd}
        executionImpactUsd={executionImpactUsd}
      />
      <TokenAllocationBoard plan={weeklyPlan} />

      <section className="space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Týždenná exekúcia
          </p>
          <h3 className="mt-1 text-sm font-bold text-white">
            Token karty · MKT / LMT
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
                pendingLimit={pendingFor(plan.symbol) ?? null}
                marketFill={marketFillThisWeek(plan.symbol) ?? null}
                limitFill={limitFillThisWeek(plan.symbol) ?? null}
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
