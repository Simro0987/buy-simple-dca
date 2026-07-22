"use client";

import { motion } from "framer-motion";
import { BarChart3, Sparkles, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import {
  computeDcaBacktestComparison,
  type DcaBacktestStrategyMetrics,
} from "@/lib/dcaBacktestMetrics";
import { smoothColorClass } from "@/lib/motion";
import { formatDecimal, formatSignedPct } from "@/lib/numberFormat";

interface DcaBacktestModuleProps {
  finalScore: number;
  fearGreed: number;
  regimeLabel: string;
  allocationPercent: number;
}

function MetricRow({
  label,
  value,
  accentClass,
}: {
  label: string;
  value: string;
  accentClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px]">
      <span className="text-zinc-500">{label}</span>
      <span
        className={`font-semibold tabular-nums transition-all duration-700 ease-in-out ${accentClass ?? "text-zinc-300"}`}
      >
        {value}
      </span>
    </div>
  );
}

function StrategyColumn({
  strategy,
  variant,
  animatedEfficiency,
  animatedCostIndex,
}: {
  strategy: DcaBacktestStrategyMetrics;
  variant: "static" | "dynamic";
  animatedEfficiency: number;
  animatedCostIndex: number;
}) {
  const isDynamic = variant === "dynamic";

  return (
    <motion.div
      layout
      className={`rounded-2xl border p-4 transition-all duration-500 ease-in-out ${
        isDynamic
          ? "border-emerald-500/20 bg-emerald-500/[0.05]"
          : "border-white/5 bg-[#0a0a0c]"
      }`}
    >
      <div className="mb-3 flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            isDynamic
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-zinc-800 text-zinc-500"
          }`}
        >
          {isDynamic ? (
            <Sparkles className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
        </span>
        <p
          className={`text-[11px] font-bold leading-snug ${smoothColorClass} ${
            isDynamic ? "text-emerald-300" : "text-zinc-400"
          }`}
        >
          {strategy.label}
        </p>
      </div>

      <div className="space-y-2">
        <MetricRow
          label="Cost basis index (12M)"
          value={formatDecimal(animatedCostIndex, 1)}
          accentClass={isDynamic ? "text-emerald-400" : "text-zinc-300"}
        />
        <MetricRow
          label="Efektívnosť akumulácie"
          value={`${formatDecimal(animatedEfficiency, 1)} / 100`}
          accentClass={isDynamic ? "text-emerald-400" : "text-zinc-300"}
        />
        <MetricRow
          label="Split / režim"
          value={strategy.marketLimitSplit}
        />
      </div>

      {strategy.highlight && (
        <p
          className={`mt-3 text-[10px] leading-relaxed ${smoothColorClass} ${
            isDynamic ? "text-emerald-400/85" : "text-zinc-600"
          }`}
        >
          {strategy.highlight}
        </p>
      )}
    </motion.div>
  );
}

export function DcaBacktestModule({
  finalScore,
  fearGreed,
  regimeLabel,
  allocationPercent,
}: DcaBacktestModuleProps) {
  const comparison = useMemo(
    () =>
      computeDcaBacktestComparison({
        finalScore,
        fearGreed,
        regimeLabel,
        allocationPercent,
      }),
    [finalScore, fearGreed, regimeLabel, allocationPercent],
  );

  const animatedAdvantage = useCountUp(comparison.priceAdvantagePct, 900);
  const animatedStaticEfficiency = useCountUp(
    comparison.staticDca.efficiencyScore,
    900,
  );
  const animatedDynamicEfficiency = useCountUp(
    comparison.dynamicDca.efficiencyScore,
    900,
  );
  const animatedStaticCost = useCountUp(
    comparison.staticDca.avgCostBasisIndex,
    900,
  );
  const animatedDynamicCost = useCountUp(
    comparison.dynamicDca.avgCostBasisIndex,
    900,
  );

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              História a Backtesting stratégie
            </p>
            <h3 className="text-sm font-bold text-white">
              📊 Backtest stratégie (12 mesiacov)
            </h3>
          </div>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400 transition-all duration-700 ease-in-out">
          {formatSignedPct(animatedAdvantage, 1)} edge
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StrategyColumn
          strategy={comparison.staticDca}
          variant="static"
          animatedEfficiency={animatedStaticEfficiency}
          animatedCostIndex={animatedStaticCost}
        />
        <StrategyColumn
          strategy={comparison.dynamicDca}
          variant="dynamic"
          animatedEfficiency={animatedDynamicEfficiency}
          animatedCostIndex={animatedDynamicCost}
        />
      </div>

      <p className="mt-4 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-[10px] leading-relaxed text-zinc-500">
        Simulovaný 12M backtest odvodený z aktuálneho Final Score, Fear & Greed
        a režimu. Nižší cost basis index = lepšia priemerná nákupná cena.
      </p>
    </motion.section>
  );
}
