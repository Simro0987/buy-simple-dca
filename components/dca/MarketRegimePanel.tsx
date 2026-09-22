"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Droplets,
  Gauge,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { FactorBreakdown, MarketRegime, RegimeFactorId } from "@/lib/dca/types";
import { SAFE_HAVEN_COPY } from "@/lib/dca/confluence";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";

const factorIcons: Record<RegimeFactorId, typeof Gauge> = {
  valuation: Wallet,
  trend: TrendingUp,
  sentiment: Gauge,
  momentum: Activity,
  risk: Droplets,
};

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
        Makro mozog · dynamické váhy
      </p>
      <h3 className="mt-1 text-sm font-bold uppercase tracking-wide text-white">
        {regime.label} · {regime.description}
      </h3>
      {regime.blend.length > 0 && (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
          {regime.blend.map((row) => `${row.label} ${row.percent.toFixed(0)}%`).join(" · ")}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            CONFLUENCE
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
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300"
              style={{ width: `${regime.finalScore}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">
            Vážený priemer 5 faktorov · istota {regime.confidence}
          </p>
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Koše (plynulo)
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

      <div className="mt-4 grid grid-cols-1 gap-2">
        {regime.factors.map((factor: FactorBreakdown) => {
          const Icon = factorIcons[factor.id];
          return (
            <div
              key={factor.id}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">
                    {factor.label}
                    {factor.source === "mock" && (
                      <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                        mock
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] font-bold text-zinc-300">
                    {factor.score}
                    <span className="ml-1 font-medium text-zinc-600">
                      w {(factor.weight * 100).toFixed(0)}%
                    </span>
                  </p>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-400/80"
                    style={{ width: `${factor.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] font-medium text-cyan-200/80">
                  {factor.formula}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-500">{factor.note}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        Váhy sa interpolujú medzi PANIKA / MEDVEĎ / STRANA / BÝK / EUFÓRIA (žiadne schody).
        CONFLUENCE plynulo mapuje koše. High-Beta strop 25%. REDUCE a LMT refund → Hotovosť.
      </p>
    </motion.section>
  );
}
