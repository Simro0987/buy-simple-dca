"use client";

import { motion } from "framer-motion";
import type { MarketRegime } from "@/lib/dca/types";
import { SAFE_HAVEN_COPY } from "@/lib/dca/confluence";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";

interface MarketRegimePanelProps {
  regime: MarketRegime;
  loading?: boolean;
}

export function MarketRegimePanel({
  regime,
  loading = false,
}: MarketRegimePanelProps) {
  const mix = regime.basket;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glassPanel} p-5`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Trhová analýza
      </p>
      <h3 className="mt-1 text-sm font-bold uppercase tracking-wide text-white">
        TRHOVÝ REŽIM: {regime.englishKind} • {regime.description}
      </h3>
      {regime.blend.length > 0 && (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
          {regime.blend.map((row) => `${row.label} ${row.percent.toFixed(0)}%`).join(" · ")}
        </p>
      )}

      <div className="mt-3">
        <span className="inline-flex rounded-full border border-amber-400/70 bg-gradient-to-r from-amber-500/20 to-yellow-700/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.28)]">
          Istota: {regime.confidence} • ×{regime.confidenceMultiplier.toFixed(2)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Final Score
          </p>
          {loading ? (
            <PriceSkeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-black text-white">
              {regime.finalScore}
              <span className="text-sm font-medium text-zinc-500">/100</span>
            </p>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-lime-300 shadow-[0_0_12px_rgba(52,211,153,0.45)]"
              style={{ width: `${regime.finalScore}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">CONFLUENCE</p>
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Alokácia
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-300">
            {regime.allocationPercent}
            <span className="text-sm font-medium text-zinc-500">%</span>
          </p>
          <p className="mt-1 text-xs font-bold text-white">
            Core {mix.corePercent.toFixed(0)}%
          </p>
          <p className="text-xs font-semibold text-violet-300">
            Sat {mix.satellitePercent.toFixed(0)}%
          </p>
          <p className="text-xs font-semibold text-fuchsia-300">
            High-Beta {mix.highBetaPercent.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-800/90">
        <div className="flex h-full">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
            style={{ width: `${mix.corePercent}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-violet-400 to-purple-600"
            style={{ width: `${mix.satellitePercent}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-fuchsia-400 to-pink-500"
            style={{ width: `${mix.highBetaPercent}%` }}
          />
        </div>
      </div>

      {regime.safeHaven && (
        <div
          role="status"
          className="mt-3 rounded-2xl border border-amber-400/50 bg-amber-400/12 px-3 py-2.5 text-[11px] leading-relaxed font-medium text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.28)]"
        >
          {SAFE_HAVEN_COPY}
        </div>
      )}
    </motion.section>
  );
}
