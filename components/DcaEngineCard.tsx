"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { AllocationBar } from "@/components/AllocationBar";
import { FearGreedBar } from "@/components/FearGreedBar";

interface AllocationSegment {
  symbol: string;
  percent: number;
  color: string;
}

interface DcaEngineCardProps {
  moneyMode: string;
  fearGreedIndex: number;
  fearGreedLabel: string;
  allocation: AllocationSegment[];
}

export function DcaEngineCard({
  moneyMode,
  fearGreedIndex,
  fearGreedLabel,
  allocation,
}: DcaEngineCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#111113] p-5"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />

      <div className="relative space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              DCA Engine
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">
              Smart Accumulation
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
            <Zap className="h-3 w-3 fill-emerald-400" />
            Money Mode: {moneyMode}
          </span>
        </div>

        <FearGreedBar value={fearGreedIndex} label={fearGreedLabel} />
        <AllocationBar segments={allocation} />

        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
          {[
            { label: "Next Buy", value: "48h" },
            { label: "Weekly DCA", value: "$150" },
            { label: "Streak", value: "12 wks" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-white/[0.03] px-3 py-2 text-center"
            >
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                {stat.label}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-300">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
