"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Info } from "lucide-react";
import { buildAllocationExplanation } from "@/lib/dcaAllocationExplanation";
import type { ConfidenceLevel, FactorScore } from "@/lib/masterDcaEngine";

interface DcaAllocationAccordionProps {
  regimeLabel: string;
  confluenceScore: number;
  baseAllocationPercent: number;
  allocationPercent: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  factors: FactorScore[];
  fearGreedValue: number;
}

export function DcaAllocationAccordion({
  regimeLabel,
  confluenceScore,
  baseAllocationPercent,
  allocationPercent,
  confidence,
  confidenceMultiplier,
  factors,
  fearGreedValue,
}: DcaAllocationAccordionProps) {
  const [open, setOpen] = useState(false);

  const explanation = buildAllocationExplanation({
    regimeLabel,
    confluenceScore,
    baseAllocationPercent,
    allocationPercent,
    confidence,
    confidenceMultiplier,
    factors,
    fearGreedValue,
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-1 text-left"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600 text-zinc-400">
            <Info className="h-3 w-3" />
          </span>
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
            <p className="mt-3 whitespace-pre-line text-[11px] leading-relaxed text-zinc-500">
              {explanation}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
