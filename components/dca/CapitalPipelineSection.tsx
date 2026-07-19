"use client";

import { motion } from "framer-motion";
import type { CapitalPipeline } from "@/lib/masterDcaEngine";
import { formatUsd } from "@/lib/data";

interface CapitalPipelineSectionProps {
  pipeline: CapitalPipeline;
  confidenceMultiplier: number;
}

const METRICS = [
  { key: "aWeeklyBudget" as const, label: "A", title: "Týždenný rozpočet" },
  { key: "bConfluenceScore" as const, label: "B", title: "Octagon Score" },
  { key: "cAllocationPercent" as const, label: "C", title: "Alokácia %" },
  { key: "dDeployedCapital" as const, label: "D", title: "Nasadený kapitál" },
  { key: "eReserveCapital" as const, label: "E", title: "Rezerva" },
];

export function CapitalPipelineSection({
  pipeline,
  confidenceMultiplier,
}: CapitalPipelineSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Capital Pipeline
          </p>
          <h3 className="mt-1 text-sm font-bold text-white">
            A → E metriky
          </h3>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
          ×{confidenceMultiplier.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {METRICS.map((metric, index) => {
          const value = pipeline[metric.key];
          const isUsd =
            metric.key === "aWeeklyBudget" ||
            metric.key === "dDeployedCapital" ||
            metric.key === "eReserveCapital";
          const isPercent = metric.key === "cAllocationPercent";

          return (
            <motion.div
              key={metric.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex flex-col items-center rounded-2xl border border-white/5 bg-white/[0.02] px-1.5 py-3"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-black text-zinc-400">
                {metric.label}
              </span>
              <p className="mt-2 text-center text-[8px] font-medium uppercase leading-tight tracking-wide text-zinc-600">
                {metric.title}
              </p>
              <p className="mt-1 text-center text-xs font-bold text-white">
                {isUsd
                  ? formatUsd(value)
                  : isPercent
                    ? `${value}%`
                    : value}
              </p>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
