"use client";

import { motion } from "framer-motion";
import { formatUsd } from "@/lib/data";
import { formatPercent } from "@/lib/dca/format";
import { glassPanel } from "@/lib/dca/glass";
import type { TokenExecutionPlan, WeeklyDcaPlan } from "@/lib/dca/types";

function sumScore(plans: TokenExecutionPlan[]): number {
  return plans.reduce((sum, plan) => sum + plan.score, 0);
}

function GateBadge({ plan }: { plan: TokenExecutionPlan }) {
  const fail = !plan.gate.passed;
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        fail
          ? "border-rose-400/40 bg-rose-500/15 text-rose-200 line-through decoration-rose-300/80"
          : "border-emerald-400/40 bg-emerald-400/12 text-emerald-200"
      }`}
    >
      {plan.gate.badge}
    </span>
  );
}

function Row({
  plan,
  barClass,
  detail,
}: {
  plan: TokenExecutionPlan;
  barClass: string;
  detail: string;
}) {
  const locked = !plan.gate.passed;
  return (
    <div className={`space-y-1.5 ${locked ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-semibold ${locked ? "text-zinc-400 line-through" : "text-white"}`}>
          {plan.symbol}
        </p>
        <p className="text-xs font-medium text-zinc-300">{detail}</p>
      </div>
      <GateBadge plan={plan} />
      {plan.absorbedUsd > 0 && (
        <p className="text-[11px] font-semibold text-emerald-300">
          +{plan.absorbedUsd.toFixed(0)} $ presmerované
        </p>
      )}
      {plan.gate.passed && plan.basketWeightPercent > 0 && plan.category !== "CORE" && (
        <p className="text-[10px] text-zinc-500">
          Inverse RSI {plan.basketWeightPercent.toFixed(1)}% koša
        </p>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${Math.min(100, Math.max(plan.weightPercent, locked ? 0 : 4))}%` }}
        />
      </div>
    </div>
  );
}

interface TokenAllocationBoardProps {
  plan: WeeklyDcaPlan;
}

export function TokenAllocationBoard({ plan }: TokenAllocationBoardProps) {
  const core = plan.plans.filter((item) => item.category === "CORE");
  const satellites = plan.plans.filter((item) => item.category === "SATELLITE");
  const highBeta = plan.plans.filter((item) => item.category === "HIGH_BETA");
  const totalScore = sumScore(plan.plans);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glassPanel} space-y-4 p-5`}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Token alokácia · suma nákupu (live)
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Live rozdelenie nasadeného kapitálu
          </p>
        </div>
        <p className="text-[11px] font-bold text-zinc-300">
          Σ skóre {totalScore.toFixed(0)}
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
          Core
        </p>
        {core.map((item) => (
          <Row
            key={item.symbol}
            plan={item}
            barClass="bg-gradient-to-r from-amber-400 to-orange-500"
            detail={`${formatUsd(item.totalUsd)} · ${formatPercent(item.weightPercent, 0)}`}
          />
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">
          Satelity
        </p>
        {satellites.length === 0 ? (
          <p className="text-xs text-zinc-500">V tomto režime bez satelitov.</p>
        ) : (
          satellites.map((item) => (
            <Row
              key={item.symbol}
              plan={item}
              barClass={
                !item.gate.passed
                  ? "bg-zinc-600"
                  : "bg-gradient-to-r from-violet-400 to-purple-600"
              }
              detail={
                !item.gate.passed
                  ? `0$ · ${formatUsd(item.satelliteRedirectedUsd)} → ${item.waterfallDestination || "Dostupný Kapitál"}`
                  : `${formatUsd(item.totalUsd)} · ${formatPercent(item.basketWeightPercent, 1)} koša`
              }
            />
          ))
        )}
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
          High Beta
        </p>
        {highBeta.length === 0 ? (
          <p className="text-xs text-zinc-500">High-beta vrstva je teraz vypnutá.</p>
        ) : (
          highBeta.map((item) => (
            <Row
              key={item.symbol}
              plan={item}
              barClass={
                !item.gate.passed
                  ? "bg-zinc-600"
                  : "bg-gradient-to-r from-fuchsia-400 to-pink-500"
              }
              detail={
                !item.gate.passed
                  ? `0$ · ${formatUsd(item.highBetaRedirectedUsd)} → ${item.waterfallDestination || "Dostupný Kapitál"}`
                  : `${formatUsd(item.totalUsd)} · ${formatPercent(item.basketWeightPercent, 1)} koša`
              }
            />
          ))
        )}
      </div>

      {plan.satellitePausedSymbols.length > 0 && (
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/15 to-stone-900/40 p-3 text-[11px] leading-relaxed text-cyan-100">
          Smart DCA pozastavil {plan.satellitePausedSymbols.join(", ")}.{" "}
          {plan.satelliteWaterfallNote ||
            `${formatUsd(plan.satelliteRedirectedUsd)} presmerovaných waterfallom.`}
        </div>
      )}

      {plan.highBetaRejectedSymbols.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/15 to-stone-900/40 p-3 text-[11px] leading-relaxed text-amber-100">
          High-Beta protokol zamietol {plan.highBetaRejectedSymbols.join(", ")}.{" "}
          {plan.highBetaWaterfallNote ||
            `${formatUsd(plan.highBetaRedirectedUsd)} presmerovaných waterfallom.`}
        </div>
      )}

      {plan.stoppedSymbols.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-stone-900/40 p-3 text-[11px] leading-relaxed text-amber-100">
          Padajúca dýka pri {plan.stoppedSymbols.join(", ")} presúva kapitál do
          zdravších tokenov v koši, inak do Dostupný Kapitál. Core ≥ 50% je{" "}
          {plan.btcFloorSatisfied ? "splnené" : "nesplnené"}.
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
          Prečo? · Naratív posunu
        </p>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
          {plan.narrative.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
