"use client";

import { motion } from "framer-motion";
import { ConfluenceScoreBadge } from "@/components/dca/ConfluenceScoreBadge";
import { LaserBar } from "@/components/dca/LaserBar";
import { LiveMetricUnavailable } from "@/components/dca/LiveState";
import { formatUsd } from "@/lib/data";
import { SAFE_HAVEN_COPY } from "@/lib/dca/confluence";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import { confluenceTone } from "@/lib/dca/terminal";
import type { AllocationMode, WeeklyDcaPlan } from "@/lib/dca/types";
import { interactiveButton } from "@/lib/motion";

function BitcoinMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-300" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <path
        fill="currentColor"
        d="M13.4 11.7c1.4-.3 2.3-1.1 2.1-2.5-.2-1.3-1.3-1.7-2.8-1.8V5.8h-1.3v1.5c-.3 0-.7 0-1 0V5.8H9v1.6H7.4v1.4h1.5c.4 0 .6.2.6.6v5.5c0 .5-.2.7-.7.7H7.3v1.4H9v1.6h1.4v-1.6h1.3v1.6h1.3v-1.6c1.8-.1 3.1-.7 3.4-2.3.2-1.2-.4-1.9-1.5-2.2Zm-3.7-3.4c.2 0 1.8 0 2.2.1.8.1 1.2.5 1.3 1.1.1.7-.4 1.2-1.5 1.3h-2V8.3Zm2.4 6.6h-2.4v-2.6h2.4c1.2 0 1.8.4 1.9 1.2.1.8-.5 1.3-1.9 1.4Z"
      />
    </svg>
  );
}

interface PhaseSplitCardProps {
  plan: WeeklyDcaPlan;
  allocationMode: AllocationMode;
  onAllocationMode: (mode: AllocationMode) => void;
  cashReserveUsd: number;
  executionImpactUsd?: number;
  loading?: boolean;
  dataReady?: boolean;
}

export function PhaseSplitCard({
  plan,
  allocationMode,
  onAllocationMode,
  cashReserveUsd,
  executionImpactUsd = 0,
  loading = false,
  dataReady = false,
}: PhaseSplitCardProps) {
  const btcFill = Math.max(0, Math.min(100, plan.targetCorePercent));
  const displayedReserve =
    (plan.availableCapital ?? plan.reserveUsd) + cashReserveUsd + executionImpactUsd;
  const mix = plan.basketSplits;
  const tone = confluenceTone(plan.confluence);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glassPanel} p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            FÁZA B • AKO ROZDELIŤ NASADENÝ KAPITÁL
          </p>
          <h3 className="mt-1 text-sm font-bold uppercase tracking-wide text-white">
            {plan.allocationLabel} •{" "}
            {(plan.allocationSubtitle.split(" · ")[0] ?? plan.allocationSubtitle).toUpperCase()}
          </h3>
          <p className="mt-1 font-mono text-[11px] text-zinc-600">
            z nasadeného {formatUsd(plan.deployedCapital)}
          </p>
        </div>
        <ConfluenceScoreBadge
          score={plan.confluence}
          ready={dataReady}
          loading={loading}
        />
      </div>

      <div className="mt-3 flex gap-2" role="tablist" aria-label="Režim alokácie">
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

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-300">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <BitcoinMark />
            BTC Podiel
          </span>
          <span className="font-mono font-bold text-[#00FFA3]">{btcFill.toFixed(0)}%+</span>
        </div>
        <LaserBar segments={[{ width: Math.min(100, btcFill), tone: "approved" }]} />
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Bitcoin musí ≥50% nasadeného kapitálu. Zvyšok ≤50% ide do satelitov a
          high-beta podľa CONFLUENCE.
        </p>
      </div>

      <div
        className="mt-4 rounded-2xl border border-white/5 bg-black/20 p-3"
        style={
          dataReady
            ? { boxShadow: `inset 0 0 22px ${tone.glow}`, borderColor: `${tone.hex}33` }
            : undefined
        }
      >
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          Koše podľa CONFLUENCE
        </p>
        <LaserBar
          segments={[
            { width: mix.corePercent, tone: "orange" },
            { width: mix.satellitePercent, tone: "violet" },
            { width: mix.highBetaPercent, tone: "fuchsia" },
          ]}
        />
        <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[11px] font-semibold">
          <span className="text-amber-300">
            Core {mix.corePercent.toFixed(0)}% · {formatUsd(plan.finalBudgets.coreUsd)}
          </span>
          <span className="text-violet-300">
            Sat {mix.satellitePercent.toFixed(0)}% · {formatUsd(plan.finalBudgets.satelliteUsd)}
          </span>
          <span className="text-fuchsia-300">
            HB {mix.highBetaPercent.toFixed(0)}% · {formatUsd(plan.finalBudgets.highBetaUsd)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Core
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white">
            {mix.corePercent.toFixed(0)}%
          </p>
          <p className="font-mono text-xs text-zinc-400">{formatUsd(plan.finalBudgets.coreUsd)}</p>
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
            Satelity
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white">
            {mix.satellitePercent.toFixed(0)}%
          </p>
          <p className="font-mono text-xs text-zinc-400">{formatUsd(plan.finalBudgets.satelliteUsd)}</p>
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">
            High-Beta
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-white">
            {mix.highBetaPercent.toFixed(0)}%
          </p>
          <p className="font-mono text-xs text-zinc-400">{formatUsd(plan.finalBudgets.highBetaUsd)}</p>
        </div>
      </div>

      {plan.regime.safeHaven && (
        <div
          role="status"
          className="mt-4 rounded-2xl border border-amber-400/50 bg-amber-400/12 px-3 py-2.5 text-[11px] leading-relaxed font-medium text-amber-100 shadow-[0_0_22px_rgba(251,191,36,0.28)]"
        >
          {SAFE_HAVEN_COPY}
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          CONFLUENCE indikátory · 200 WMA / F&G / Likvidita / ATR / CBBI
        </p>
        {plan.regime.confluenceIndicators.map((row) => (
          <p key={row.id} className="text-[11px] leading-relaxed text-zinc-400">
            <span className="font-semibold text-zinc-200">{row.label}</span>
            {" · "}
            {row.source === "live" ? (
              <span className={row.id === "fearGreed" ? "font-mono text-cyan-100" : undefined}>
                {row.formula}
              </span>
            ) : (
              <LiveMetricUnavailable label={row.label} />
            )}
            <span className="block text-[10px] text-zinc-600">{row.note}</span>
          </p>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Dostupný Kapitál
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-white">
            {formatUsd(displayedReserve, displayedReserve < 0 ? { showSign: true } : undefined)}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Z týždňa nenasadené {formatUsd(plan.undeployedToReserve)}
          </p>
          {plan.brakeBoostReserveDelta !== 0 && (
            <p
              className={`mt-0.5 text-[10px] font-semibold ${
                plan.brakeBoostReserveDelta > 0 ? "text-amber-300" : "text-lime-300"
              }`}
            >
              Brzda & boost {formatUsd(plan.brakeBoostReserveDelta, { showSign: true })} → pool
            </p>
          )}
          {executionImpactUsd !== 0 && (
            <p className="mt-0.5 text-[10px] font-semibold text-cyan-300">
              Exekúcia {formatUsd(executionImpactUsd, { showSign: true })}
            </p>
          )}
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Nasadený kapitál
          </p>
          <p className="mt-1 font-mono text-sm font-bold text-[#00FFA3]">
            {formatUsd(plan.deployedCapital)}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            z {formatUsd(plan.baseAmount)} · {plan.allocationPercent.toFixed(0)}%
          </p>
        </div>
      </div>
    </motion.section>
  );
}
