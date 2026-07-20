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
import { formatUsd } from "@/lib/data";
import type { ConfidenceLevel, FactorScore } from "@/lib/masterDcaEngine";

interface MasterAllocationCardProps {
  factors: FactorScore[];
  confluenceScore: number;
  cashReserve: number;
  weeklyCapital: number;
  regimeLabel: string;
  baseAllocationPercent: number;
  allocationPercent: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  fearGreedValue: number;
}

const FACTOR_ICONS: Record<string, LucideIcon> = {
  value: Gauge,
  trend: TrendingUp,
  sentiment: Heart,
  momentum: Activity,
  risk: Shield,
};

export function MasterAllocationCard({
  factors,
  confluenceScore,
  cashReserve,
  weeklyCapital,
  regimeLabel,
  baseAllocationPercent,
  allocationPercent,
  confidence,
  confidenceMultiplier,
  fearGreedValue,
}: MasterAllocationCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5"
    >
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          5 Faktorov • Váhy podľa režimu
        </p>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {factors.map((factor, index) => {
          const Icon = FACTOR_ICONS[factor.id] ?? Gauge;
          const weightPct = Math.round(factor.weight * 100);

          return (
            <motion.div
              key={factor.id}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.12 + index * 0.04 }}
              className="flex min-w-[108px] shrink-0 flex-col rounded-2xl border border-emerald-400/20 bg-[#0a0a0c] px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className="h-3.5 w-3.5 text-emerald-400/70" />
                <span className="text-sm font-bold text-emerald-400">
                  {factor.score}
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
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${factor.score}%` }}
                  transition={{ duration: 0.6, delay: 0.2 + index * 0.05 }}
                  className="h-full rounded-full bg-emerald-400"
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
        Váhy sa menia dynamicky podľa zisteného režimu (BULL / BEAR / SIDEWAYS /
        PANIC / EUFÓRIA).
      </p>

      <div className="mt-5 flex gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Hotovosť rezerva
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {formatUsd(cashReserve)}
          </p>
        </div>
        <div className="flex-1 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Týždenný kapitál
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {formatUsd(weeklyCapital)}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-white/5 pt-4">
        <DcaAllocationAccordion
          regimeLabel={regimeLabel}
          confluenceScore={confluenceScore}
          baseAllocationPercent={baseAllocationPercent}
          allocationPercent={allocationPercent}
          confidence={confidence}
          confidenceMultiplier={confidenceMultiplier}
          factors={factors}
          fearGreedValue={fearGreedValue}
        />
      </div>
    </motion.section>
  );
}
