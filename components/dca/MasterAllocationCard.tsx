"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Gauge,
  Heart,
  Shield,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { DcaAllocationAccordion } from "@/components/dca/DcaAllocationAccordion";
import { useCountUp } from "@/hooks/useCountUp";
import { formatUsd } from "@/lib/data";
import { getScoreColor } from "@/lib/dcaScoreColors";
import type { ConfidenceLevel, FactorScore } from "@/lib/masterDcaEngine";

interface MasterAllocationCardProps {
  factors: FactorScore[];
  confluenceScore: number;
  cashReserve: number;
  weeklyCapital: number;
  regimeLabel: string;
  baseAllocationPercent: number;
  allocationPercent: number;
  dynamicAnchor: number;
  dynamicSlope: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  section?: "all" | "factors" | "capital" | "accordion";
}

const FACTOR_ICONS: Record<string, LucideIcon> = {
  value: Gauge,
  trend: TrendingUp,
  sentiment: Heart,
  momentum: Activity,
  risk: Shield,
};

function FactorPill({
  factor,
  index,
}: {
  factor: FactorScore;
  index: number;
}) {
  const Icon = FACTOR_ICONS[factor.id] ?? Gauge;
  const weightPct = Math.round(factor.weight * 100);
  const animatedScore = useCountUp(factor.score, 700);
  const factorColor = getScoreColor(factor.score);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: 0.12 + index * 0.04 }}
      className={`flex min-w-[108px] shrink-0 flex-col rounded-2xl border bg-[#0a0a0c] px-3 py-3 transition-colors duration-700 ease-out ${factorColor.badgeBorder}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon
          className={`h-3.5 w-3.5 transition-colors duration-700 ease-out ${factorColor.icon}`}
        />
        <span
          className={`text-sm font-bold tabular-nums transition-colors duration-700 ease-out ${factorColor.text}`}
        >
          {Math.round(animatedScore)}
        </span>
      </div>

      <div className="mt-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-300">
          {factor.name}
        </p>
        <p className="mt-0.5 text-[9px] font-medium text-zinc-600">
          w {weightPct}%
        </p>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${factorColor.bg}`}
          style={{ width: `${factor.score}%` }}
        />
      </div>
    </motion.div>
  );
}

export function MasterAllocationCard({
  factors,
  confluenceScore,
  cashReserve,
  weeklyCapital,
  regimeLabel,
  baseAllocationPercent,
  allocationPercent,
  dynamicAnchor,
  dynamicSlope,
  confidence,
  confidenceMultiplier,
  section = "all",
}: MasterAllocationCardProps) {
  const animatedReserve = useCountUp(cashReserve, 700);
  const animatedCapital = useCountUp(weeklyCapital, 700);

  const showFactors = section === "all" || section === "factors";
  const showCapital = section === "all" || section === "capital";
  const showAccordion = section === "all" || section === "accordion";

  if (section === "capital") {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.04, ease: "easeOut" }}
        className="rounded-2xl border border-white/5 bg-[#0d0d0f] px-5 py-4"
      >
        <div className="flex gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Hotovosť rezerva
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white transition-all duration-700 ease-out">
              {formatUsd(animatedReserve)}
            </p>
          </div>
          <div className="flex-1 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Týždenný kapitál
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white transition-all duration-700 ease-out">
              {formatUsd(animatedCapital)}
            </p>
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5"
    >
      {showFactors && (
        <>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            5 Faktorov
          </p>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            {factors.map((factor, index) => (
              <FactorPill key={factor.id} factor={factor} index={index} />
            ))}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
            Lineárna interpolácia: Value (−40%…+40% vs SMA200) • Trend (EMA50 vs
            SMA200) • Sentiment & Momentum & Risk priamo z F&G / RSI / ATR.
          </p>
        </>
      )}

      {showCapital && section === "all" && (
        <div className={`flex gap-4 ${showFactors ? "mt-5" : ""}`}>
          <div className="flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Hotovosť rezerva
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white transition-all duration-700 ease-out">
              {formatUsd(animatedReserve)}
            </p>
          </div>
          <div className="flex-1 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Týždenný kapitál
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white transition-all duration-700 ease-out">
              {formatUsd(animatedCapital)}
            </p>
          </div>
        </div>
      )}

      {showAccordion && (
        <div
          className={
            showFactors || (showCapital && section === "all")
              ? "mt-5 border-t border-white/5 pt-4"
              : ""
          }
        >
          <DcaAllocationAccordion
            regimeLabel={regimeLabel}
            confluenceScore={confluenceScore}
            baseAllocationPercent={baseAllocationPercent}
            allocationPercent={allocationPercent}
            dynamicAnchor={dynamicAnchor}
            dynamicSlope={dynamicSlope}
            confidence={confidence}
            confidenceMultiplier={confidenceMultiplier}
            factors={factors}
          />
        </div>
      )}
    </motion.section>
  );
}
