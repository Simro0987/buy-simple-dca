"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useMemo } from "react";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUnitPrice, formatUsd } from "@/lib/data";
import { getCategoryStyles } from "@/lib/assetStyles";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { sumExecutionOrders } from "@/lib/dcaFinalExecutionOrders";
import {
  useExecutionDeployState,
  type DeployState,
  type OrderLeg,
} from "@/hooks/useExecutionDeployState";
import { useCountUp } from "@/hooks/useCountUp";
import {
  interactiveCard,
  smoothWidthTransition,
} from "@/lib/motion";

interface ExecutionEngineCardsProps {
  finalExecutionOrders: TokenExecutionPlan[];
  deployedCapital?: number;
  loading?: boolean;
}

const listItemMotion = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98, height: 0, marginBottom: 0 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
};

const buttonTransition = "transition-all duration-300 ease-in-out";

function DeployLegButton({
  leg,
  amountUsd,
  state,
  onDeploy,
}: {
  leg: OrderLeg;
  amountUsd: number;
  state: DeployState;
  onDeploy: () => void;
}) {
  const isMarket = leg === "market";
  const label = isMarket ? "Market" : "Limit";

  const idleClass = isMarket
    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:bg-emerald-400/20"
    : "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:bg-emerald-400/20";

  const loadingClass =
    "animate-pulse border-zinc-500/30 bg-zinc-700/40 text-zinc-300 cursor-wait";

  const successClass = isMarket
    ? "border-zinc-600/40 bg-zinc-800/60 text-zinc-500 cursor-not-allowed"
    : "border-orange-500/25 bg-orange-500/10 text-orange-300/80 cursor-default";

  const className = `${buttonTransition} w-full rounded-xl border px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide ${
    state === "loading"
      ? loadingClass
      : state === "success"
        ? successClass
        : idleClass
  }`;

  const text =
    state === "loading"
      ? "Odosielam..."
      : state === "success"
        ? isMarket
          ? "✓ Vykonané (Filled)"
          : "⏳ Čaká na burze (Open)"
        : `Aktivovať ${label} · ${formatUsd(amountUsd)}`;

  return (
    <button
      type="button"
      className={className}
      disabled={state !== "idle" || amountUsd <= 0}
      onClick={onDeploy}
    >
      {text}
    </button>
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

function ExecutionOrderCard({
  plan,
  loading,
  getLegState,
  onDeployLeg,
}: {
  plan: TokenExecutionPlan;
  loading: boolean;
  getLegState: (symbol: string, leg: OrderLeg) => DeployState;
  onDeployLeg: (symbol: string, leg: OrderLeg) => void;
}) {
  const catStyles = getCategoryStyles(plan.category);
  const unitPrice = plan.spotPrice;
  const marketState = getLegState(plan.symbol, "market");
  const limitState = getLegState(plan.symbol, "limit");

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
            <div className="flex items-center gap-2">
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
              {plan.yieldMergeActive && (
                <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-400">
                  Merge
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">{plan.name}</p>
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
            {plan.weightPercent}%
          </p>
          <p className="text-sm font-semibold tabular-nums text-white transition-all duration-1000 ease-in-out">
            <OrderAmountDisplay value={plan.totalUsd} />
          </p>
        </div>
      </div>

      {plan.entrySignal && (
        <p className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] font-medium leading-relaxed text-emerald-400 transition-all duration-300 ease-in-out">
          {plan.entrySignal}
        </p>
      )}

      {plan.minOrderRuleActive && plan.splitExplanation && (
        <p className="mb-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[10px] font-bold leading-relaxed text-blue-300 transition-all duration-300 ease-in-out">
          {plan.splitExplanation}
        </p>
      )}

      {!plan.minOrderRuleActive && plan.splitExplanation && (
        <p className="mb-3 text-[10px] font-medium leading-relaxed text-zinc-500 transition-all duration-300 ease-in-out">
          {plan.splitExplanation}
        </p>
      )}

      {plan.safetyBrakeActive && (
        <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-400/90 transition-all duration-300 ease-in-out">
          Safety Brake: BTC vysoko nad 200D SMA — posilnený Limit podiel
        </p>
      )}

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
            <span className="text-[10px] font-medium tabular-nums text-zinc-500 transition-all duration-1000 ease-in-out">
              {plan.marketShare}%
            </span>
          </div>
          <p className="mt-1 text-base font-bold text-white">
            <OrderAmountDisplay value={plan.marketUsd} />
          </p>
          {plan.marketUsd > 0 && (
            <div className="mt-2.5">
              <DeployLegButton
                leg="market"
                amountUsd={plan.marketUsd}
                state={marketState}
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
            <span className="text-[10px] font-medium tabular-nums text-zinc-500 transition-all duration-1000 ease-in-out">
              {plan.limitShare}%
            </span>
          </div>
          <p className="mt-1 text-base font-bold text-white">
            <OrderAmountDisplay value={plan.limitUsd} />
          </p>
          {plan.limitPrice > 0 && (
            <p className="mt-0.5 text-[10px] text-orange-400/70">
              @ {formatUnitPrice(plan.limitPrice)}
            </p>
          )}
          {plan.limitUsd > 0 && (
            <div className="mt-2.5">
              <DeployLegButton
                leg="limit"
                amountUsd={plan.limitUsd}
                state={limitState}
                onDeploy={() => onDeployLeg(plan.symbol, "limit")}
              />
            </div>
          )}
        </div>
      </div>

      {plan.limitShare > 0 && plan.whyLimit && (
        <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Prečo limit?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {plan.whyLimit}
          </p>
        </div>
      )}
    </motion.article>
  );
}

export function ExecutionEngineCards({
  finalExecutionOrders,
  deployedCapital = 0,
  loading = false,
}: ExecutionEngineCardsProps) {
  const ordersTotal = sumExecutionOrders(finalExecutionOrders);
  const { masterState, getLegState, deployLeg, deployAll } =
    useExecutionDeployState(finalExecutionOrders);

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
          {finalExecutionOrders.length} tokenov • filter 3/3 yield • celkom{" "}
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

      <button
        type="button"
        disabled={
          masterState !== "idle" ||
          loading ||
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
              getLegState={getLegState}
              onDeployLeg={(symbol, leg) => void deployLeg(symbol, leg)}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.section>
  );
}
