"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { useMarketRegimeFactors } from "@/hooks/useMarketRegimeFactors";
import { buildMarketRegimeFactors } from "@/lib/dcaMarketRegimeFactors";
import { formatUnitPrice } from "@/lib/data";
import { getScoreColor } from "@/lib/dcaScoreColors";
import { smoothColorClass } from "@/lib/motion";

function CircularFactorPill({
  label,
  displayValue,
  colorScore,
  icon: Icon,
  index,
  loading,
}: {
  label: string;
  displayValue: string;
  colorScore: number;
  icon: LucideIcon;
  index: number;
  loading?: boolean;
}) {
  const colors = getScoreColor(colorScore);

  if (loading) {
    return (
      <div className="flex min-w-[84px] shrink-0 flex-col items-center gap-2">
        <PriceSkeleton className="h-[84px] w-[84px] rounded-full" />
        <PriceSkeleton className="h-2.5 w-14 rounded-md" />
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.05 }}
      className={`flex min-w-[84px] shrink-0 flex-col items-center gap-2 ${smoothColorClass}`}
    >
      <div
        className={`relative flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full border-2 bg-[#0a0a0c] shadow-[0_0_24px_rgba(0,0,0,0.35)] ${smoothColorClass} ${colors.badgeBorder}`}
      >
        <div
          className={`absolute inset-1 rounded-full opacity-30 ${smoothColorClass} ${colors.badgeBg}`}
        />
        <Icon
          className={`relative z-10 h-4 w-4 ${smoothColorClass} ${colors.icon}`}
        />
        <span
          className={`relative z-10 mt-1 text-[11px] font-bold tabular-nums leading-none ${smoothColorClass} ${colors.text}`}
        >
          {displayValue}
        </span>
      </div>
      <p className={`max-w-[84px] text-center text-[9px] font-bold uppercase tracking-wide text-zinc-400 ${smoothColorClass}`}>
        {label}
      </p>
    </motion.div>
  );
}

export function MarketRegimeFactorPills() {
  const { data: raw, loading, error } = useMarketRegimeFactors();

  const data = useMemo(
    () => (raw ? buildMarketRegimeFactors(raw) : null),
    [raw],
  );

  const showSkeleton = loading && !data;

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
        {error && (
          <p className="mb-2 text-[10px] text-amber-400/90 transition-all duration-700">
            {error}
          </p>
        )}

        {showSkeleton ? (
          <div className="space-y-3">
            <PriceSkeleton className="h-4 w-56 rounded-md" />
            <div className="-mx-1 flex gap-3 overflow-hidden px-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <CircularFactorPill
                  key={index}
                  label=""
                  displayValue=""
                  colorScore={50}
                  icon={TrendingUp}
                  index={index}
                  loading
                />
              ))}
            </div>
          </div>
        ) : data ? (
          <>
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-zinc-400 ${smoothColorClass}`}>
              <span className="text-zinc-300">
                BTC Live:{" "}
                <span className={`font-bold text-white ${smoothColorClass}`}>
                  {formatUnitPrice(data.btcPrice)}
                </span>
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                200WMA:{" "}
                <span className={`font-semibold text-zinc-200 ${smoothColorClass}`}>
                  {formatUnitPrice(data.wma200)}
                </span>
              </span>
              <span className="text-zinc-600">•</span>
              <span
                className={`${smoothColorClass} ${
                  data.distWmaPct >= 0 ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {data.distWmaPct >= 0 ? "+" : ""}
                {data.distWmaPct.toFixed(2)}%
              </span>
              {loading && (
                <span className="text-[9px] text-zinc-600">• obnovujem…</span>
              )}
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
        ) : null}
      </div>
    </motion.section>
  );
}
