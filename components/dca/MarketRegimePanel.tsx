"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Gauge,
  Gem,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type { FactorBreakdown, MarketRegime } from "@/lib/dca/types";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";

const factorIcons: Record<FactorBreakdown["id"], typeof Gem> = {
  value: Gem,
  trend: TrendingUp,
  sentiment: Activity,
  momentum: Gauge,
  risk: ShieldAlert,
};

interface MarketRegimePanelProps {
  regime: MarketRegime;
  loading?: boolean;
}

export function MarketRegimePanel({
  regime,
  loading = false,
}: MarketRegimePanelProps) {
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
        Trhový režim: {regime.label} · {regime.description}
      </h3>

      <div className="mt-3 inline-flex items-center rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.15)]">
        Istota: {regime.confidence} · x{regime.confidenceMultiplier.toFixed(2)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Finálne skóre
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
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
              style={{ width: `${regime.finalScore}%` }}
            />
          </div>
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Alokácia
          </p>
          {loading ? (
            <PriceSkeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-black text-emerald-400">
              {regime.allocationPercent}%
            </p>
          )}
          <p className="mt-1 text-[10px] text-zinc-500">
            Podiel týždenného kapitálu na nákup
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {regime.factors.map((factor) => {
          const Icon = factorIcons[factor.id];
          return (
            <div
              key={factor.id}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">{factor.label}</p>
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
                <p className="mt-1 text-[10px] text-zinc-500">{factor.note}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        Váhy sa menia dynamicky podľa režimu trhu — v beare rastie Value a Sentiment,
        v bule Trend a Momentum.
      </p>
    </motion.section>
  );
}
