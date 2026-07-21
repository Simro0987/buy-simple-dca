"use client";

import { motion } from "framer-motion";
import { Shield, Zap } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import type { ConfidenceLevel } from "@/lib/masterDcaEngine";
import { getScoreColor } from "@/lib/dcaScoreColors";
import { formatUsd } from "@/lib/data";
import { smoothColorClass, smoothWidthTransition } from "@/lib/motion";

interface DcaHeroSharedProps {
  regimeLabel: string;
  regimeDescription: string;
  moneyMode: string;
  confluenceScore: number;
  baseAllocationPercent: number;
  allocationPercent: number;
  dynamicAnchor: number;
  dynamicSlope: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  investmentAmount: number;
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function DcaMoneyModeBar({
  moneyMode,
  confluenceScore,
}: Pick<DcaHeroSharedProps, "moneyMode" | "confluenceScore">) {
  const scoreColor = getScoreColor(confluenceScore);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`flex items-center justify-between gap-3 rounded-full border bg-[#0a0a0c] px-4 py-2.5 ${smoothColorClass} ${scoreColor.badgeBorder} ${scoreColor.badgeBg}`}
    >
      <span
        className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-colors duration-700 ease-out ${scoreColor.badgeText}`}
      >
        <Zap
          className={`h-3.5 w-3.5 transition-colors duration-700 ease-out ${scoreColor.fill}`}
        />
        Money Mode: {moneyMode}
      </span>
      <span
        className={`text-[11px] font-medium transition-colors duration-700 ease-out ${scoreColor.badgeText} opacity-80`}
      >
        Score {confluenceScore}/100
      </span>
    </motion.div>
  );
}

export function DcaMarketRegimeCard({
  regimeLabel,
  regimeDescription,
  confluenceScore,
  allocationPercent,
  dynamicAnchor,
  dynamicSlope,
  confidence,
  confidenceMultiplier,
  investmentAmount,
}: Omit<DcaHeroSharedProps, "moneyMode" | "baseAllocationPercent">) {
  const scoreColor = getScoreColor(confluenceScore);
  const animatedScore = useCountUp(confluenceScore, 700);
  const animatedAllocation = useCountUp(allocationPercent, 700);
  const animatedInvestment = useCountUp(investmentAmount, 700);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04, ease: "easeOut" }}
      className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Trhový režim
          </p>
          <p className="mt-1 text-lg font-bold text-white">
            {regimeLabel} • {regimeDescription}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${smoothColorClass} ${scoreColor.badgeBorder} ${scoreColor.badgeBg} ${scoreColor.badgeText}`}
        >
          <Shield className="h-3 w-3" />
          Confidence {CONFIDENCE_LABELS[confidence]} • ×
          {confidenceMultiplier.toFixed(2)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Final Score
          </p>
          <p className="mt-2 flex items-baseline gap-1">
            <span
              className={`text-5xl font-black tabular-nums leading-none ${smoothColorClass} ${scoreColor.text}`}
            >
              {animatedScore.toFixed(1)}
            </span>
            <span className="text-lg font-medium text-zinc-600">/100</span>
          </p>
          <p className="mt-2 text-[10px] font-medium text-zinc-600">
            0 = lacný • 100 = drahý • {scoreColor.label}
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-800/90">
            <motion.div
              initial={false}
              animate={{ width: `${confluenceScore}%` }}
              transition={smoothWidthTransition}
              className={`h-full rounded-full ${smoothColorClass} ${scoreColor.bg}`}
            />
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Alokácia
          </p>
          <p className="mt-2 text-5xl font-black tabular-nums leading-none text-white transition-all duration-700 ease-out">
            {animatedAllocation.toFixed(1)}%
          </p>
          <p className="mt-2 text-[11px] text-zinc-500">
            anchor {dynamicAnchor.toFixed(2)} − score×{dynamicSlope.toFixed(2)}{" "}
            • × {confidenceMultiplier.toFixed(2)}
          </p>
          <p
            className={`mt-4 text-xl font-bold ${smoothColorClass} ${scoreColor.text}`}
          >
            {formatUsd(animatedInvestment)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/** @deprecated Use DcaMoneyModeBar + DcaMarketRegimeCard for layout control */
export function DcaHeroDashboard(props: DcaHeroSharedProps) {
  return (
    <div className="space-y-3">
      <DcaMoneyModeBar
        moneyMode={props.moneyMode}
        confluenceScore={props.confluenceScore}
      />
      <DcaMarketRegimeCard
        regimeLabel={props.regimeLabel}
        regimeDescription={props.regimeDescription}
        confluenceScore={props.confluenceScore}
        allocationPercent={props.allocationPercent}
        dynamicAnchor={props.dynamicAnchor}
        dynamicSlope={props.dynamicSlope}
        confidence={props.confidence}
        confidenceMultiplier={props.confidenceMultiplier}
        investmentAmount={props.investmentAmount}
      />
    </div>
  );
}
