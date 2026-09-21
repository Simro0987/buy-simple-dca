"use client";

import { motion } from "framer-motion";
import { formatUsd } from "@/lib/data";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import type { AllocationMode, WeeklyDcaPlan } from "@/lib/dca/types";
import { interactiveButton } from "@/lib/motion";

interface PortfolioSplitSectionProps {
  plan: WeeklyDcaPlan;
  allocationMode: AllocationMode;
  onAllocationMode: (mode: AllocationMode) => void;
}

export function PortfolioSplitSection({
  plan,
  allocationMode,
  onAllocationMode,
}: PortfolioSplitSectionProps) {
  const corePct = Math.max(0, Math.min(100, plan.corePercent));
  const altPct = Math.max(0, 100 - corePct);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className={`${glassPanel} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {plan.allocationLabel} · {plan.allocationSubtitle}
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              Core (BTC) {corePct.toFixed(0)}% · Altcoins {altPct.toFixed(0)}%
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Režim alokácie
          </p>
          <div className="flex gap-2" role="tablist" aria-label="Režim alokácie">
            {(
              [
                ["ALL", "ALL"],
                ["BTC_ONLY", "BTC ONLY"],
              ] as const
            ).map(([mode, label]) => {
              const active = allocationMode === mode;
              return (
                <motion.button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onAllocationMode(mode)}
                  {...interactiveButton}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                    active
                      ? "border border-emerald-400/50 bg-emerald-400/15 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.2)]"
                      : "border border-white/10 bg-zinc-900/80 text-zinc-500"
                  }`}
                >
                  {label}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex h-4 overflow-hidden rounded-full">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400"
              style={{ width: `${corePct}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-400"
              style={{ width: `${altPct}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className={`${glassInset} p-3`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                Core · BTC
              </p>
              <p className="mt-1 text-lg font-bold text-white">{corePct.toFixed(0)}%</p>
              <p className="text-xs text-zinc-400">{formatUsd(plan.coreUsd)}</p>
            </div>
            <div className={`${glassInset} p-3`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-300">
                Altcoins
              </p>
              <p className="mt-1 text-lg font-bold text-white">{altPct.toFixed(0)}%</p>
              <p className="text-xs text-zinc-400">{formatUsd(plan.altUsd)}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Plynulý prechod medzi core a altami podľa skóre. BTC floor 50% ostáva
            vždy v platnosti.
          </p>
        </div>
      </div>
    </motion.section>
  );
}
