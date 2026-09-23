"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { formatUsd } from "@/lib/data";
import type { FlashCrashPlan } from "@/lib/dca/types";
import { interactiveButton } from "@/lib/motion";

interface FlashCrashBannerProps {
  plan: FlashCrashPlan;
  activated: boolean;
  activating: boolean;
  onActivate: () => void;
}

export function FlashCrashBanner({
  plan,
  activated,
  activating,
  onActivate,
}: FlashCrashBannerProps) {
  if (!plan.active) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-rose-400/60 bg-gradient-to-br from-rose-600/25 via-zinc-950/70 to-amber-600/15 p-4 shadow-[0_0_36px_rgba(244,63,94,0.35)]"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200">
        Flash Crash Mode
      </p>
      <h3 className="mt-1 text-sm font-black uppercase tracking-wide text-white">
        Prudký výpredaj — jednorazový nákup z Dostupný Kapitál
      </h3>
      <p className="mt-2 text-[12px] leading-relaxed text-rose-50/90">
        Odporúčame nasadiť ~{plan.poolShare.toFixed(0)}% Dostupný Kapitál (
        {formatUsd(plan.spendUsd)}) cez Market do zľavnených aktív.
      </p>
      {plan.targets.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-rose-100/80">
          {plan.targets.map((row) => (
            <li key={row.symbol}>
              {row.symbol} · {formatUsd(row.usd)}
            </li>
          ))}
        </ul>
      )}
      <motion.button
        type="button"
        onClick={onActivate}
        disabled={activated || activating || plan.spendUsd <= 0}
        {...interactiveButton}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-300/60 bg-rose-500/20 px-4 py-3 text-[12px] font-black uppercase tracking-wide text-rose-50 disabled:opacity-60"
      >
        <Zap className="h-4 w-4" aria-hidden="true" />
        {activated ? "Flash Crash zrealizovaný" : "Aktivovať Flash Crash nákup"}
      </motion.button>
    </motion.section>
  );
}
