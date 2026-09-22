"use client";

import { Activity, Droplets, Gauge, TrendingUp, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import type { FactorBreakdown, MarketRegime, RegimeFactorId } from "@/lib/dca/types";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import { formatUsd } from "@/lib/data";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { interactiveButton } from "@/lib/motion";

const factorIcons: Record<RegimeFactorId, typeof Gauge> = {
  valuation: Wallet,
  trend: TrendingUp,
  sentiment: Gauge,
  momentum: Activity,
  risk: Droplets,
};

interface MarketRegimePanelProps {
  regime: MarketRegime;
  baseAmount: number;
  deployedCapital: number;
  undeployedToReserve: number;
  engineAllocationPercent: number;
  allocationOverride: number | null;
  onAllocationChange: (value: number) => void;
  onResetAllocation: () => void;
  loading?: boolean;
}

export function MarketRegimePanel({
  regime,
  baseAmount,
  deployedCapital,
  undeployedToReserve,
  engineAllocationPercent,
  allocationOverride,
  onAllocationChange,
  onResetAllocation,
  loading = false,
}: MarketRegimePanelProps) {
  const overridden = allocationOverride != null;
  const blend = regime.deploymentBlend.length > 0 ? regime.deploymentBlend : regime.blend;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glassPanel} p-5`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        FÁZA A • KOĽKO NASADIŤ
      </p>
      <h3 className="mt-1 text-sm font-bold uppercase tracking-wide text-white">
        TRHOVÝ REŽIM: {regime.englishKind} • {regime.description}
      </h3>
      {blend.length > 0 && (
        <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
          {blend.map((row) => `${row.label} ${row.percent.toFixed(0)}%`).join(" · ")}
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
          <p className="mt-1 text-[10px] text-zinc-500">5 faktorov → alokácia %</p>
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Alokácia
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-300">
            {regime.allocationPercent.toFixed(0)}
            <span className="text-sm font-medium text-zinc-500">%</span>
          </p>
          <p className="mt-1 text-xs font-bold text-white">
            Nasadené {formatUsd(deployedCapital)}
          </p>
          <p className="text-xs font-semibold text-amber-200/90">
            Hotovosť {formatUsd(undeployedToReserve)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="dca-allocation-slider" className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Alokácia % z {formatUsd(baseAmount)}
          </label>
          <motion.button
            type="button"
            onClick={onResetAllocation}
            disabled={!overridden}
            {...interactiveButton}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              overridden
                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : "border-white/10 bg-white/5 text-zinc-600"
            }`}
          >
            Auto {engineAllocationPercent.toFixed(0)}%
          </motion.button>
        </div>
        <input
          id="dca-allocation-slider"
          type="range"
          min={12}
          max={85}
          step={1}
          value={Math.round(regime.allocationPercent)}
          onChange={(event) => onAllocationChange(Number(event.target.value))}
          className="mt-2 w-full accent-emerald-400"
          aria-label="Percento týždennej sumy na nasadenie"
        />
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          5 faktorov · Valuácia / Trend / Sentiment / Momentum / Riziko
        </p>
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
              </div>
            </div>
          );
        })}
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Final Score z týchto 5 faktorov určuje, koľko z týždenného rozpočtu sa
          nasadí. Zvyšok ide do Hotovosť rezervy. Koše Core / Sat / High-Beta ráta
          až Fáza B z nasadeného kapitálu.
        </p>
      </div>
    </motion.section>
  );
}
