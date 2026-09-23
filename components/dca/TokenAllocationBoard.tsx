"use client";

import { motion } from "framer-motion";
import { LaserBar } from "@/components/dca/LaserBar";
import { NarrativeText } from "@/components/dca/NarrativeText";
import { formatUsd } from "@/lib/data";
import { formatPercent } from "@/lib/dca/format";
import { glassPanel } from "@/lib/dca/glass";
import { getHeatmapColor, heatTextStyle } from "@/lib/dca/heatmap";
import { approvedBadge, stoppedBadge } from "@/lib/dca/terminal";
import type { TokenExecutionPlan, WeeklyDcaPlan } from "@/lib/dca/types";

function sumScore(plans: TokenExecutionPlan[]): number {
  return plans.reduce((sum, plan) => sum + plan.score, 0);
}

function OrderRow({
  plan,
  barTone,
}: {
  plan: TokenExecutionPlan;
  barTone: "orange" | "violet" | "fuchsia";
}) {
  const locked = !plan.gate.passed;
  const redirected = locked
    ? plan.satelliteRedirectedUsd || plan.highBetaRedirectedUsd
    : 0;
  const destination = plan.waterfallDestination || "POOL";
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p
              className={`text-sm font-semibold ${
                locked ? "text-zinc-500 line-through" : "text-white"
              }`}
            >
              {plan.symbol}
            </p>
            <span className={locked ? stoppedBadge : approvedBadge}>{plan.gate.badge}</span>
          </div>
        </div>
        <div className="text-right font-mono text-[12px] leading-none">
          {plan.absorbedUsd > 0 && (
            <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-[#00FFA3]">
              +{plan.absorbedUsd.toFixed(0)} $ PRESMEROVANÉ
            </p>
          )}
          {locked ? (
            <p className="text-[#FF2A6D]">
              {formatUsd(0)}{" "}
              <span className="text-zinc-500">-&gt;</span> {destination}
            </p>
          ) : (
            <p className="text-cyan-100">
              {formatUsd(plan.totalUsd)}
              {plan.basketWeightPercent > 0 && plan.category !== "CORE" ? (
                <span className="ml-2" style={heatTextStyle(plan.basketWeightPercent)}>
                  {formatPercent(plan.basketWeightPercent, 1)}
                </span>
              ) : (
                <span className="ml-2" style={heatTextStyle(plan.weightPercent)}>
                  {formatPercent(plan.weightPercent, 0)}
                </span>
              )}
            </p>
          )}
          {locked && redirected > 0 && (
            <p className="mt-1 text-[10px] text-zinc-600">{formatUsd(redirected)}</p>
          )}
        </div>
      </div>
      <LaserBar
        segments={[
          {
            width: Math.min(100, Math.max(plan.weightPercent, locked ? 0 : 4)),
            color: locked
              ? undefined
              : getHeatmapColor(
                  plan.basketWeightPercent > 0 && plan.category !== "CORE"
                    ? plan.basketWeightPercent
                    : plan.weightPercent,
                  "standard",
                ),
            tone: locked ? "stopped" : barTone,
          },
        ]}
      />
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
        <p className="font-mono text-[11px] font-bold text-cyan-100">
          Σ {totalScore.toFixed(0)}
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
          Core
        </p>
        {core.map((item) => (
          <OrderRow key={item.symbol} plan={item} barTone="orange" />
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
            <OrderRow key={item.symbol} plan={item} barTone="violet" />
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
            <OrderRow key={item.symbol} plan={item} barTone="fuchsia" />
          ))
        )}
      </div>

      {plan.satellitePausedSymbols.length > 0 && (
        <div className="border border-[#FF2A6D] bg-[rgba(255,42,109,0.1)] p-3 text-[11px] leading-relaxed text-[#FF2A6D]">
          Smart DCA pozastavil {plan.satellitePausedSymbols.join(", ")}.{" "}
          {plan.satelliteWaterfallNote ||
            `${formatUsd(plan.satelliteRedirectedUsd)} presmerovaných waterfallom.`}
        </div>
      )}

      {plan.highBetaRejectedSymbols.length > 0 && (
        <div className="border border-[#FF2A6D] bg-[rgba(255,42,109,0.1)] p-3 text-[11px] leading-relaxed text-[#FF2A6D]">
          High-Beta protokol zamietol {plan.highBetaRejectedSymbols.join(", ")}.{" "}
          {plan.highBetaWaterfallNote ||
            `${formatUsd(plan.highBetaRedirectedUsd)} presmerovaných waterfallom.`}
        </div>
      )}

      {plan.stoppedSymbols.length > 0 && (
        <div className="border border-[#FF2A6D] bg-[rgba(255,42,109,0.1)] p-3 text-[11px] leading-relaxed text-[#FF2A6D]">
          Padajúca dýka pri {plan.stoppedSymbols.join(", ")} presúva kapitál do
          zdravších tokenov v koši, inak do Dostupný Kapitál. Core ≥ 50% je{" "}
          {plan.btcFloorSatisfied ? "splnené" : "nesplnené"}.
        </div>
      )}

      <div className="border border-white/5 bg-black/30 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
          Prečo?
        </p>
        <ul className="mt-2 space-y-2.5 text-[12px] leading-7">
          {plan.narrative.map((line) => (
            <li key={line}>
              <NarrativeText text={line} />
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
