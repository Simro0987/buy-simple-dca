"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import type { ExecutionAdvisor } from "@/lib/masterDcaEngine";

interface ExecutionPerformanceSectionProps {
  advisor: ExecutionAdvisor;
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-400/15 border-emerald-400/30",
  B: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  C: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  D: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  E: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  F: "text-red-400 bg-red-400/10 border-red-400/30",
};

export function ExecutionPerformanceSection({
  advisor,
}: ExecutionPerformanceSectionProps) {
  const gradeStyle =
    GRADE_COLORS[advisor.efficiencyGrade] ?? GRADE_COLORS.C;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Execution Performance
        </p>
        <h3 className="mt-1 text-sm font-bold text-white">
          Active Advisor
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-center">
          <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
            Alpha vs Market
          </p>
          <p
            className={`mt-1 text-lg font-bold ${advisor.alphaVsMarketPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {advisor.alphaVsMarketPct >= 0 ? "+" : ""}
            {advisor.alphaVsMarketPct}%
          </p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-center">
          <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
            Market DCA
          </p>
          <p className="mt-1 text-lg font-bold text-zinc-300">
            {advisor.marketDcaBaselinePct >= 0 ? "+" : ""}
            {advisor.marketDcaBaselinePct}%
          </p>
        </div>
        <div
          className={`flex flex-col items-center justify-center rounded-2xl border p-3 ${gradeStyle}`}
        >
          <p className="text-[9px] font-medium uppercase tracking-wider opacity-70">
            Grade
          </p>
          <p className="text-2xl font-black">{advisor.efficiencyGrade}</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
            Active Advisor
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-300">
            {advisor.activeAdvice}
          </p>
          {advisor.dcaTransactionCount > 0 && (
            <p className="mt-1 text-[10px] text-zinc-600">
              {advisor.dcaTransactionCount} DCA transakcií analyzovaných
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}
