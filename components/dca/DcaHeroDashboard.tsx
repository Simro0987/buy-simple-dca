"use client";

import { motion } from "framer-motion";
import { Shield, Zap } from "lucide-react";
import type { ConfidenceLevel } from "@/lib/masterDcaEngine";
import { formatUsd } from "@/lib/data";

interface DcaHeroDashboardProps {
  regimeLabel: string;
  regimeDescription: string;
  moneyMode: string;
  confluenceScore: number;
  baseAllocationPercent: number;
  allocationPercent: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  investmentAmount: number;
}

const CONFIDENCE_STYLES: Record<
  ConfidenceLevel,
  { label: string; className: string }
> = {
  high: {
    label: "High",
    className:
      "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  medium: {
    label: "Medium",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },
  low: {
    label: "Low",
    className: "border-rose-400/30 bg-rose-500/15 text-rose-300",
  },
};

export function DcaHeroDashboard({
  regimeLabel,
  regimeDescription,
  moneyMode,
  confluenceScore,
  baseAllocationPercent,
  allocationPercent,
  confidence,
  confidenceMultiplier,
  investmentAmount,
}: DcaHeroDashboardProps) {
  const conf = CONFIDENCE_STYLES[confidence];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between gap-3 rounded-full border border-emerald-400/35 bg-[#0a0a0c] px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
          <Zap className="h-3.5 w-3.5 fill-emerald-400" />
          Money Mode: {moneyMode}
        </span>
        <span className="text-[11px] font-medium text-zinc-500">
          Score {confluenceScore}/100
        </span>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5">
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
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${conf.className}`}
          >
            <Shield className="h-3 w-3" />
            Confidence {conf.label} • ×{confidenceMultiplier.toFixed(2)}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Final Score
            </p>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-5xl font-black leading-none text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.35)]">
                {confluenceScore}
              </span>
              <span className="text-lg font-medium text-zinc-600">/100</span>
            </p>
            <p className="mt-2 text-[10px] font-medium text-zinc-600">
              0 = lacný • 100 = drahý
            </p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-800/90">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${confluenceScore}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
              />
            </div>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Alokácia
            </p>
            <p className="mt-2 text-5xl font-black leading-none text-white">
              {allocationPercent}%
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              base {baseAllocationPercent}% × {confidenceMultiplier.toFixed(2)}
            </p>
            <p className="mt-4 text-xl font-bold text-emerald-400">
              {formatUsd(investmentAmount)}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-white/5" />
      </div>
    </motion.div>
  );
}
