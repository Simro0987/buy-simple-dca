"use client";

import { motion } from "framer-motion";

interface Factor {
  name: string;
  score: number;
  status: string;
}

interface FactorPillsProps {
  factors: Factor[];
}

function scoreColor(score: number) {
  if (score >= 70) return "bg-emerald-400";
  if (score >= 40) return "bg-amber-400";
  return "bg-red-400";
}

export function FactorPills({ factors }: FactorPillsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16, ease: "easeOut" }}
      className="space-y-2.5"
    >
      <p className="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
        5 Faktorov
      </p>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {factors.map((factor, index) => (
          <motion.div
            key={factor.name}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
            className="min-w-[108px] shrink-0 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-zinc-300">
                {factor.name}
              </p>
              <span className="text-[10px] font-bold text-zinc-500">
                {factor.score}
              </span>
            </div>

            <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${factor.score}%` }}
                transition={{ duration: 0.6, delay: 0.3 + index * 0.06 }}
                className={`h-full rounded-full ${scoreColor(factor.score)}`}
              />
            </div>

            <p className="mt-1.5 truncate text-[9px] font-medium uppercase tracking-wide text-zinc-600">
              {factor.status}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
