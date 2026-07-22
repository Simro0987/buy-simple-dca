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
import type { FactorScore } from "@/lib/masterDcaEngine";

interface FactorPillsProps {
  factors: FactorScore[];
  confluenceScore: number;
}

const FACTOR_ICONS: Record<string, LucideIcon> = {
  value: Gauge,
  trend: TrendingUp,
  sentiment: Heart,
  momentum: Activity,
  risk: Shield,
};

export function FactorPills({ factors, confluenceScore }: FactorPillsProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-end justify-between gap-3 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          5 Faktorov • Váhy podľa režimu
        </p>
        <p className="text-[10px] font-medium text-zinc-600">
          vážený = {confluenceScore}
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
              className="flex min-w-[108px] shrink-0 flex-col rounded-2xl border border-emerald-400/20 bg-[#0d0d0f] px-3 py-3"
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

      <p className="px-1 text-[10px] leading-relaxed text-zinc-600">
        Váhy sa menia dynamicky podľa zisteného režimu (BULL / BEAR / SIDEWAYS /
        PANIC / EUFÓRIA).
      </p>
    </motion.section>
  );
}
