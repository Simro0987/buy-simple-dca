"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { CapitalPipelineSection } from "@/components/dca/CapitalPipelineSection";
import { ExecutionPerformanceSection } from "@/components/dca/ExecutionPerformanceSection";
import { MarketRegimeFactors } from "@/components/dca/MarketRegimeFactors";
import type {
  CapitalPipeline,
  ExecutionAdvisor,
  FactorScore,
} from "@/lib/masterDcaEngine";

interface DcaAllocationAccordionProps {
  pipeline: CapitalPipeline;
  confidenceMultiplier: number;
  factors: FactorScore[];
  confluenceScore: number;
  advisor: ExecutionAdvisor;
  loading?: boolean;
}

export function DcaAllocationAccordion({
  pipeline,
  confidenceMultiplier,
  factors,
  confluenceScore,
  advisor,
  loading = false,
}: DcaAllocationAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0d0d0f]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-zinc-200">
          Prečo táto alokácia?
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-white/5 px-4 pb-4 pt-3">
              <CapitalPipelineSection
                pipeline={pipeline}
                confidenceMultiplier={confidenceMultiplier}
              />
              <MarketRegimeFactors
                factors={factors}
                confluenceScore={confluenceScore}
                loading={loading}
              />
              <ExecutionPerformanceSection advisor={advisor} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
