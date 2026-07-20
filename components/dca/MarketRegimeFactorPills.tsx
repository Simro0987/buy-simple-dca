"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { buildMarketRegimeFactors } from "@/lib/dcaMarketRegimeFactors";
import type { DcaMarketSnapshot } from "@/lib/dcaMarketData";
import { formatUnitPrice } from "@/lib/data";
import { getScoreColor } from "@/lib/dcaScoreColors";

interface MarketRegimeFactorPillsProps {
  snapshot: DcaMarketSnapshot | null;
  loading?: boolean;
}

function CircularFactorPill({
  label,
  displayValue,
  colorScore,
  icon: Icon,
  index,
}: {
  label: string;
  displayValue: string;
  colorScore: number;
  icon: LucideIcon;
  index: number;
}) {
  const colors = getScoreColor(colorScore);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.05 }}
      className={`flex min-w-[84px] shrink-0 flex-col items-center gap-2 transition-colors duration-700 ease-out`}
    >
      <div
        className={`relative flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full border-2 bg-[#0a0a0c] shadow-[0_0_24px_rgba(0,0,0,0.35)] transition-all duration-700 ease-out ${colors.badgeBorder}`}
        style={{
          boxShadow: `0 0 28px color-mix(in srgb, currentColor 18%, transparent)`,
        }}
      >
        <div
          className={`absolute inset-1 rounded-full opacity-30 transition-colors duration-700 ${colors.badgeBg}`}
        />
        <Icon
          className={`relative z-10 h-4 w-4 transition-colors duration-700 ${colors.icon}`}
        />
        <span
          className={`relative z-10 mt-1 text-[11px] font-bold tabular-nums leading-none transition-colors duration-700 ${colors.text}`}
        >
          {displayValue}
        </span>
      </div>
      <p className="max-w-[84px] text-center text-[9px] font-bold uppercase tracking-wide text-zinc-400 transition-colors duration-700">
        {label}
      </p>
    </motion.div>
  );
}

export function MarketRegimeFactorPills({
  snapshot,
  loading = false,
}: MarketRegimeFactorPillsProps) {
  const data = useMemo(
    () => (snapshot ? buildMarketRegimeFactors(snapshot) : null),
    [snapshot],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.06, ease: "easeOut" }}
      className="space-y-3"
    >
      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        5 Faktorov Trhového Režimu
      </p>

      <div className="rounded-2xl border border-white/5 bg-[#0d0d0f] px-4 py-3">
        {loading || !data ? (
          <div className="space-y-3">
            <PriceSkeleton className="h-4 w-56 rounded-md" />
            <div className="-mx-1 flex gap-3 overflow-hidden px-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <PriceSkeleton
                  key={index}
                  className="h-[84px] w-[84px] shrink-0 rounded-full"
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-zinc-400 transition-all duration-700">
              <span className="text-zinc-300">
                BTC Live:{" "}
                <span className="font-bold text-white">
                  {formatUnitPrice(data.btcPrice)}
                </span>
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                200WMA:{" "}
                <span className="font-semibold text-zinc-200">
                  {formatUnitPrice(data.wma200)}
                </span>
              </span>
              <span className="text-zinc-600">•</span>
              <span
                className={
                  data.distWmaPct >= 0 ? "text-amber-400" : "text-emerald-400"
                }
              >
                {data.distWmaPct >= 0 ? "+" : ""}
                {data.distWmaPct.toFixed(2)}%
              </span>
            </div>

            <div className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-none">
              {data.factors.map((factor, index) => (
                <CircularFactorPill
                  key={factor.id}
                  label={factor.label}
                  displayValue={factor.displayValue}
                  colorScore={factor.colorScore}
                  icon={factor.icon}
                  index={index}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </motion.section>
  );
}
