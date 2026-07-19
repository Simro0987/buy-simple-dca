"use client";

import { motion } from "framer-motion";
import { TrendingDown } from "lucide-react";
import { formatUsd } from "@/lib/data";

interface MarketRegimeSectionProps {
  label: string;
  description: string;
  finalScore: number;
  allocationPercent: number;
  investmentAmount: number;
}

export function MarketRegimeSection({
  label,
  description,
  finalScore,
  allocationPercent,
  investmentAmount,
}: MarketRegimeSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="space-y-4 rounded-2xl border border-red-500/15 bg-red-500/10 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15">
            <TrendingDown className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-red-400/80">
              Trhový režim
            </p>
            <p className="text-sm font-bold text-red-300">
              {label} — {description}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <p className="text-xs font-medium text-zinc-500">Final Score</p>
          <p className="text-sm font-semibold text-white">
            {finalScore}
            <span className="text-zinc-600">/100</span>
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${finalScore}%` }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.4)]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-red-500/10 pt-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Alokácia
          </p>
          <p className="mt-0.5 text-xl font-bold text-white">
            {allocationPercent}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Investícia
          </p>
          <p className="mt-0.5 text-xl font-bold text-emerald-400">
            {formatUsd(investmentAmount)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
