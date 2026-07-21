"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useMemo } from "react";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { CopyValueButton } from "@/components/ui/CopyValueButton";
import { formatUnitPrice, formatUsd } from "@/lib/data";
import {
  formatCopyAmount2,
  formatCopyLimitPrice4,
} from "@/lib/executionFormatting";
import { getCategoryStyles } from "@/lib/assetStyles";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { IndicatorTone } from "@/lib/dcaTokenIndicators";
import type { TradingMode } from "@/lib/exchange/types";
import { sumExecutionOrders } from "@/lib/dcaFinalExecutionOrders";
import { YIELD_FILTER_THRESHOLDS } from "@/lib/dcaYieldFilter";
import {
  useExecutionDeployState,
  type DeployState,
  type OrderLeg,
} from "@/hooks/useExecutionDeployState";
import { useCountUp } from "@/hooks/useCountUp";
import {
  interactiveCard,
  smoothColorClass,
  smoothWidthTransition,
} from "@/lib/motion";

interface ExecutionEngineCardsProps {
  finalExecutionOrders: TokenExecutionPlan[];
  deployedCapital?: number;
  loading?: boolean;
  tradingMode: TradingMode;
  yieldConvictionCount?: number;
  yieldUniverseCount?: number;
  executionAllowed?: boolean;
  onDeployAll: () => Promise<void>;
  onDeployLeg?: (
    symbol: string,
    leg: OrderLeg,
    plan: TokenExecutionPlan,
  ) => Promise<void>;
  onCancelLimit?: (symbol: string) => void;
}

const listItemMotion = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98, height: 0, marginBottom: 0 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
};

const buttonTransition = "transition-all duration-500 ease-in-out";

const toneClasses: Record<IndicatorTone, string> = {
  neutral: "border-white/10 bg-white/[0.03] text-zinc-300",
  bullish: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  bearish: "border-rose-500/20 bg-rose-500/10 text-rose-300",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
};

const statusToneClasses = {
  ok: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  brake: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  watch: "border-blue-500/20 bg-blue-500/10 text-blue-300",
} as const;

function DeployLegButton({
  leg,
  amountUsd,
  state,
  disabled,
  onDeploy,
}: {
  leg: OrderLeg;
  amountUsd: number;
  state: DeployState;
  disabled?: boolean;
  onDeploy: () => void;
}) {
  const isMarket = leg === "market";
  const label = isMarket ? "Market" : "Limit";

  const idleClass = isMarket
    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:bg-emerald-400/20"
    : "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:bg-emerald-400/20";

  const loadingClass =
    "animate-pulse border-zinc-500/30 bg-zinc-700/40 text-zinc-300 cursor-wait";

  const activatedClass = isMarket
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 cursor-default"
    : "border-orange-500/25 bg-orange-500/10 text-orange-300/90 cursor-default";

  const className = `${buttonTransition} w-full rounded-xl border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide ${
    state === "loading"
      ? loadingClass
      : state === "market_activated" || state === "limit_watching"
        ? activatedClass
        : state === "success"
          ? activatedClass
          : idleClass
  }`;

  const text =
    state === "loading"
      ? "Odosielam..."
      : state === "market_activated"
        ? "Market je aktivovaný"
        : state === "limit_watching"
          ? "Limit je aktivovaný – sleduje cenu"
          : state === "success"
            ? isMarket
              ? "Market je aktivovaný"
              : "Limit je aktivovaný – sleduje cenu"
            : `Aktivovať ${label}`;

  const isDisabled =
    disabled ||
    state === "loading" ||
    state === "market_activated" ||
    state === "limit_watching" ||
    state === "success" ||
    amountUsd <= 0;

  return (
    <button
      type="button"
      className={className}
      disabled={isDisabled}
      onClick={onDeploy}
    >
      {text}
    </button>
  );
}

function CopyableAmountRow({
  label,
  value,
  formatted,
}: {
  label: string;
  value: number;
  formatted: string;
}) {
  if (value <= 0) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
      <div>
        <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-600">
          {label}
        </p>
        <p className="text-sm font-bold tabular-nums text-white">{formatted}</p>
      </div>
      <CopyValueButton value={formatted} label="Kopírovať sumu" />
    </div>
  );
}

function OrderAmountDisplay({ value }: { value: number }) {
  const animated = useCountUp(value, 1000);
  return (
    <span className="tabular-nums transition-all duration-1000 ease-in-out">
      {formatUsd(animated)}
    </span>
  );
}

function ShareDisplay({ value }: { value: number }) {
  const animated = useCountUp(value, 800);
  return (
    <span className="tabular-nums transition-all duration-1000 ease-in-out">
      {animated.toFixed(1)}%
    </span>
  );
}

function IndicatorChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: IndicatorTone;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`rounded-lg border px-2 py-1 transition-all duration-500 ease-in-out ${toneClasses[tone]}`}
    >
      <p className="text-[8px] font-semibold uppercase tracking-wider opacity-70">
        {label}
      </p>
      <p className="text-[11px] font-bold tabular-nums">{value}</p>
    </motion.div>
  );
}

function RegimeStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: TokenExecutionPlan["regimeStatusTone"];
}) {
  return (
    <motion.span
      layout
      className={`rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide transition-all duration-500 ease-in-out ${statusToneClasses[tone]}`}
    >
      {label}
    </motion.span>
  );
}

function ExecutionOrderCard({
  plan,
  loading,
  executionAllowed,
  getLegState,
  onDeployLeg,
  onCancelLimit,
}: {
  plan: TokenExecutionPlan;
  loading: boolean;
  executionAllowed: boolean;
  getLegState: (symbol: string, leg: OrderLeg) => DeployState;
  onDeployLeg: (symbol: string, leg: OrderLeg) => void;
  onCancelLimit: (symbol: string) => void;
}) {
  const catStyles = getCategoryStyles(plan.category);
  const unitPrice = plan.spotPrice;
  const marketState = getLegState(plan.symbol, "market");
  const limitState = getLegState(plan.symbol, "limit");

  const yieldHeader =
    plan.category === "yield" && plan.convictionScore != null
      ? `S ${Math.round(plan.convictionScore)} • RSI ${plan.rsi14?.toFixed(0) ?? "—"} • MA ${plan.priceVsSma14Pct != null ? `${plan.priceVsSma14Pct >= 0 ? "+" : ""}${plan.priceVsSma14Pct.toFixed(0)}%` : "—"} • Fund. ${plan.fundamentalScore != null ? Math.round(plan.fundamentalScore) : "—"}`
      : null;

  const yieldAllocationLabel =
    plan.category === "yield" && plan.shareOfYieldPercent != null
      ? `${plan.shareOfYieldPercent.toFixed(1)}% Yield kôša • ${formatUsd(plan.totalUsd)}${
          plan.yieldWeight != null
            ? ` • váha S^${YIELD_FILTER_THRESHOLDS.weightExponent} = ${Math.round(plan.yieldWeight).toLocaleString("en-US")}`
            : ""
        }`
      : null;

  return (
    <motion.article
      layout
      {...listItemMotion}
      {...interactiveCard}
      className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-4"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ring-2 ${catStyles.ring}`}
            style={{ backgroundColor: `${catStyles.color}20` }}
          >
            {plan.logoUrl ? (
              <Image
                src={plan.logoUrl}
                alt={plan.symbol}
                width={28}
                height={28}
                className="rounded-full"
                unoptimized
              />
            ) : (
              <span
                className="text-xs font-bold"
                style={{ color: catStyles.color }}
              >
                {plan.symbol.slice(0, 1)}
              </span>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-bold text-white">{plan.symbol}</p>
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
                style={{
                  color: catStyles.color,
                  backgroundColor: `${catStyles.color}15`,
                }}
              >
                {plan.category}
              </span>
              {plan.tag && (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
                  {plan.tag}
                </span>
              )}
              <RegimeStatusBadge
                label={plan.regimeStatusLabel}
                tone={plan.regimeStatusTone}
              />
              {plan.yieldMergeActive && (
                <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-blue-300 transition-all duration-500 ease-in-out">
                  Min Order
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">{plan.name}</p>
            {yieldAllocationLabel ? (
              <p className="mt-1 text-[10px] font-semibold tabular-nums text-teal-300/90 transition-all duration-500 ease-in-out">
                {yieldAllocationLabel}
              </p>
            ) : null}
            {yieldHeader ? (
              <p className="mt-0.5 text-[10px] font-medium text-teal-400/80 transition-all duration-500 ease-in-out">
                {yieldHeader}
              </p>
            ) : (
              <p className="mt-0.5 text-[10px] text-zinc-600">
                {loading ? (
                  <PriceSkeleton className="inline-block h-3 w-20" />
                ) : plan.marketStatusFallback ? (
                  <span className="text-amber-400/80">
                    Market Status · {plan.change24h >= 0 ? "+" : ""}
                    {plan.change24h.toFixed(1)}% 24h
                  </span>
                ) : (
                  <>Live @ {formatUnitPrice(unitPrice)}</>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Týždenný podiel
          </p>
          <p
            className="text-lg font-bold tabular-nums transition-all duration-1000 ease-in-out"
            style={{ color: catStyles.color }}
          >
            <ShareDisplay value={plan.weightPercent} />
          </p>
          <p className="text-sm font-semibold tabular-nums text-white transition-all duration-1000 ease-in-out">
            <OrderAmountDisplay value={plan.totalUsd} />
          </p>
        </div>
      </div>

      {plan.indicatorChips.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {plan.indicatorChips.map((chip) => (
            <IndicatorChip
              key={`${plan.symbol}-${chip.label}`}
              label={chip.label}
              value={chip.value}
              tone={chip.tone}
            />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {plan.entrySignal && (
          <motion.p
            key={plan.entrySignal}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] font-medium leading-relaxed text-emerald-400"
          >
            {plan.entrySignal}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {plan.minOrderRuleActive && plan.splitExplanation ? (
          <motion.p
            key={`min-${plan.splitExplanation}`}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="mb-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[10px] font-bold leading-relaxed text-blue-300"
          >
            {plan.splitExplanation}
          </motion.p>
        ) : (
          plan.splitExplanation && (
            <motion.p
              key={`split-${plan.splitExplanation}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
              className={`mb-3 text-[10px] font-medium leading-relaxed ${smoothColorClass} ${
                plan.safetyBrakeActive ? "text-amber-400/90" : "text-zinc-500"
              }`}
            >
              {plan.splitExplanation}
            </motion.p>
          )
        )}
      </AnimatePresence>

      <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-zinc-800/80">
        <motion.div
          layout
          initial={false}
          animate={{ width: `${plan.marketShare}%` }}
          transition={smoothWidthTransition}
          className="h-full bg-emerald-400 transition-all duration-1000 ease-in-out"
          title="Market"
        />
        <motion.div
          layout
          initial={false}
          animate={{ width: `${plan.limitShare}%` }}
          transition={smoothWidthTransition}
          className="h-full bg-orange-500 transition-all duration-1000 ease-in-out"
          title="Limit"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              MKT
            </span>
            <span className="text-[10px] font-medium tabular-nums text-zinc-500">
              <ShareDisplay value={plan.marketShare} />
            </span>
          </div>
          <p className="mt-1 text-base font-bold text-white">
            <OrderAmountDisplay value={plan.marketUsd} />
          </p>
          <CopyableAmountRow
            label="Suma za nákup (Market)"
            value={plan.marketUsd}
            formatted={formatCopyAmount2(plan.marketUsd)}
          />
          {plan.marketUsd > 0 && (
            <div className="mt-2.5">
              <DeployLegButton
                leg="market"
                amountUsd={plan.marketUsd}
                state={marketState}
                disabled={!executionAllowed}
                onDeploy={() => onDeployLeg(plan.symbol, "market")}
              />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-orange-500/15 bg-orange-500/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
              LMT
            </span>
            <span className="text-[10px] font-medium tabular-nums text-zinc-500">
              <ShareDisplay value={plan.limitShare} />
            </span>
          </div>
          <p className="mt-1 text-base font-bold text-white">
            <OrderAmountDisplay value={plan.limitUsd} />
          </p>
          <CopyableAmountRow
            label="Suma za nákup (Limit)"
            value={plan.limitUsd}
            formatted={formatCopyAmount2(plan.limitUsd)}
          />
          {plan.limitPrice > 0 && (
            <>
              <p className="mt-0.5 text-[10px] text-orange-400/70 transition-all duration-500 ease-in-out">
                @ {formatUnitPrice(plan.limitPrice)}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-orange-500/10 bg-black/20 px-2 py-1.5">
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-600">
                    Limitná cena nákupu
                  </p>
                  <p className="text-sm font-bold tabular-nums text-orange-300">
                    {formatCopyLimitPrice4(plan.limitPrice)}
                  </p>
                </div>
                <CopyValueButton
                  value={formatCopyLimitPrice4(plan.limitPrice)}
                  label="Kopírovať cenu"
                />
              </div>
            </>
          )}
          {plan.limitUsd > 0 && (
            <div className="mt-2.5 space-y-2">
              <DeployLegButton
                leg="limit"
                amountUsd={plan.limitUsd}
                state={limitState}
                disabled={!executionAllowed}
                onDeploy={() => onDeployLeg(plan.symbol, "limit")}
              />
              {limitState === "limit_watching" && (
                <button
                  type="button"
                  onClick={() => onCancelLimit(plan.symbol)}
                  className={`${buttonTransition} w-full rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-rose-300 hover:bg-rose-500/15`}
                >
                  Zrušiť limit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {plan.limitShare > 0 && plan.whyLimit && (
          <motion.div
            key={plan.whyLimit}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
          >
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              Prečo limit?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400 transition-all duration-500 ease-in-out">
              {plan.whyLimit}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function ExecutionEngineCards({
  finalExecutionOrders,
  deployedCapital = 0,
  loading = false,
  tradingMode,
  yieldConvictionCount = 0,
  yieldUniverseCount = 0,
  executionAllowed = true,
  onDeployAll,
  onDeployLeg,
  onCancelLimit,
}: ExecutionEngineCardsProps) {
  const ordersTotal = sumExecutionOrders(finalExecutionOrders);
  const { masterState, deployError, getLegState, deployLeg, deployAll, cancelLimit } =
    useExecutionDeployState(finalExecutionOrders, {
      onDeployAll,
      onDeployLeg,
      onCancelLimit,
    });

  const yieldCountLabel = useMemo(() => {
    if (yieldUniverseCount > 0) {
      return `${yieldConvictionCount}/${yieldUniverseCount} yield conviction (filter 3/3)`;
    }
    const yieldOrders = finalExecutionOrders.filter(
      (order) => order.category === "yield",
    ).length;
    return `${yieldOrders} yield tokenov`;
  }, [finalExecutionOrders, yieldConvictionCount, yieldUniverseCount]);

  const masterLabel = useMemo(() => {
    if (masterState === "loading") return "Odosielam všetky príkazy...";
    if (masterState === "success") return "✓ Portfólio aktualizované";
    return `🚀 Aktivovať všetky príkazy (Deploy All) · Celkom: ${formatUsd(ordersTotal)}`;
  }, [masterState, ordersTotal]);

  const masterClass =
    masterState === "loading"
      ? `${buttonTransition} animate-pulse border-zinc-500/30 bg-zinc-700/50 text-zinc-300 cursor-wait`
      : masterState === "success"
        ? `${buttonTransition} border-zinc-600/40 bg-zinc-800/70 text-zinc-500 cursor-not-allowed`
        : `${buttonTransition} border-emerald-400/35 bg-emerald-400/12 text-emerald-300 shadow-[0_0_32px_rgba(52,211,153,0.22)] hover:bg-emerald-400/18`;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Execution Engine
        </p>
        <h3 className="mt-1 text-sm font-bold text-white">
          Dynamic Split · MKT / LMT
        </h3>
        <p className="mt-1 text-[10px] text-zinc-500">
          {finalExecutionOrders.length} tokenov • {yieldCountLabel} •{" "}
          {tradingMode === "live" ? "Live Trading" : "Simulácia"} • celkom{" "}
          <span className="font-semibold text-emerald-400">
            {formatUsd(ordersTotal)}
          </span>
          {deployedCapital > 0 && (
            <span className="text-zinc-600">
              {" "}
              / {formatUsd(deployedCapital)} deploy
            </span>
          )}
        </p>
      </div>

      {deployError && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-400/90 transition-all duration-500 ease-in-out">
          {deployError}
        </p>
      )}

      <button
        type="button"
        disabled={
          masterState !== "idle" ||
          loading ||
          !executionAllowed ||
          finalExecutionOrders.length === 0 ||
          ordersTotal <= 0
        }
        onClick={() => void deployAll()}
        className={`w-full rounded-2xl border px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wide ${masterClass} disabled:opacity-60`}
      >
        {masterLabel}
      </button>

      <motion.div layout className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {finalExecutionOrders.map((plan) => (
            <ExecutionOrderCard
              key={plan.symbol}
              plan={plan}
              loading={loading}
              executionAllowed={executionAllowed}
              getLegState={getLegState}
              onDeployLeg={(symbol, leg) => void deployLeg(symbol, leg)}
              onCancelLimit={(symbol) => cancelLimit(symbol)}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.section>
  );
}
