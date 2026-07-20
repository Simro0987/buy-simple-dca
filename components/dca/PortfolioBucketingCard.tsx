"use client";

import { motion } from "framer-motion";
import { Check, Shield, X } from "lucide-react";
import { useMemo } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { formatUsd } from "@/lib/data";
import {
  computePortfolioBucketing,
  type PortfolioBucketingResult,
  type TokenAllocationRow,
  type YieldAltcoinRow,
} from "@/lib/dcaPortfolioBucketing";
import type { MasterTokenPlan } from "@/lib/masterDcaEngine";

interface PortfolioBucketingCardProps {
  deployedCapital: number;
  tokenPlans: MasterTokenPlan[];
}

function BucketAmountLabel({
  percent,
  amountUsd,
  textClass,
}: {
  percent: number;
  amountUsd: number;
  textClass: string;
}) {
  const animatedAmount = useCountUp(amountUsd, 700);

  return (
    <p className={`text-center text-[11px] font-semibold tabular-nums transition-colors duration-700 ${textClass}`}>
      {Math.round(percent)}% • {formatUsd(animatedAmount)}
    </p>
  );
}

function TokenRow({ row }: { row: TokenAllocationRow }) {
  const animatedAmount = useCountUp(row.amountUsd, 700);
  const barWidth = Math.min(100, Math.max(4, row.percentOfTotal));

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0a0a0c] px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white/10 ${row.barClass}`}
          >
            {row.symbol.slice(0, 1)}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{row.symbol}</p>
            <p className="text-[10px] text-zinc-500">{row.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold tabular-nums ${row.textClass}`}>
            {formatUsd(animatedAmount)}
          </p>
          <p className="text-[10px] text-zinc-500">
            {row.percentOfTotal.toFixed(1)}% celku
          </p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${row.barClass}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function YieldAltcoinRowItem({
  row,
  variant,
}: {
  row: YieldAltcoinRow;
  variant: "conviction" | "excluded";
}) {
  const animatedAmount = useCountUp(row.amountUsd, 700);
  const isConviction = variant === "conviction";
  const barWidth = isConviction
    ? Math.max(12, row.shareOfYieldPercent)
    : Math.min(100, row.rsi);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        isConviction
          ? "border-teal-500/20 bg-teal-500/5"
          : "border-white/5 bg-zinc-900/40 opacity-60"
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
          isConviction
            ? "bg-teal-500/20 text-teal-400"
            : "bg-zinc-800 text-zinc-500"
        }`}
      >
        {row.symbol.slice(0, 2)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold ${isConviction ? "text-white" : "text-zinc-500"}`}
          >
            {row.symbol}
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
            {row.tag}
          </span>
        </div>
        <p
          className={`mt-0.5 text-[10px] ${
            isConviction ? "text-teal-400/80" : "text-rose-400/80"
          }`}
        >
          {isConviction
            ? `RSI Oversold (${row.rsi})`
            : `RSI prekúpené (${row.rsi} >= 50)`}
        </p>
        {isConviction && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-700 ease-out"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        {isConviction ? (
          <p className="text-xs font-bold tabular-nums text-teal-400">
            {formatUsd(animatedAmount)}
          </p>
        ) : (
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
        )}
      </div>
    </div>
  );
}

function MultiColorSplitBar({
  buckets,
}: {
  buckets: PortfolioBucketingResult["buckets"];
}) {
  return (
    <div className="flex h-3.5 overflow-hidden rounded-full bg-zinc-800">
      {buckets.map((bucket) => (
        <motion.div
          key={bucket.category}
          initial={{ width: 0 }}
          animate={{ width: `${bucket.percent}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-full ${bucket.barClass} transition-colors duration-700 first:rounded-l-full last:rounded-r-full`}
          title={`${bucket.label} ${bucket.percent}%`}
        />
      ))}
    </div>
  );
}

export function PortfolioBucketingCard({
  deployedCapital,
  tokenPlans,
}: PortfolioBucketingCardProps) {
  const bucketing = useMemo(
    () => computePortfolioBucketing({ deployedCapital, tokenPlans }),
    [deployedCapital, tokenPlans],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
      className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5"
    >
      {/* Header badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-400">
          <Shield className="h-3.5 w-3.5" />
          {bucketing.badgeTitle}
        </span>
        <span className="text-[11px] font-medium text-zinc-500">
          {bucketing.badgeSubtitle}
        </span>
      </div>

      {/* Category headers */}
      <div className="mt-5 flex justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.14em]">
        {bucketing.buckets.map((bucket) => (
          <span key={bucket.category} className={bucket.textClass}>
            {bucket.label} • {bucket.subtitle}
          </span>
        ))}
      </div>

      {/* Multi-color split bar */}
      <div className="mt-3">
        <MultiColorSplitBar buckets={bucketing.buckets} />
      </div>

      {/* Bucket amounts */}
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {bucketing.buckets.map((bucket) => (
          <BucketAmountLabel
            key={bucket.category}
            percent={bucket.percent}
            amountUsd={bucket.amountUsd}
            textClass={bucket.textClass}
          />
        ))}
      </div>

      {/* Token allocation */}
      <div className="mt-6 border-t border-white/5 pt-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Token alokácia • Amount to buy (live)
        </p>

        <div className="space-y-2.5">
          <TokenRow row={bucketing.coreToken} />
          {bucketing.satelliteTokens.map((row) => (
            <TokenRow key={row.symbol} row={row} />
          ))}
        </div>
      </div>

      {/* Yield high-conviction */}
      <div className="mt-6 border-t border-white/5 pt-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Yield • High-Conviction
        </p>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-400">
                High-Conviction nákupy
              </span>
              <span className="text-[10px] text-zinc-600">
                ({bucketing.yieldAltcoins.conviction.length} /{" "}
                {bucketing.yieldAltcoinCount})
              </span>
            </div>
            <div className="space-y-2">
              {bucketing.yieldAltcoins.conviction.length > 0 ? (
                bucketing.yieldAltcoins.conviction.map((row) => (
                  <YieldAltcoinRowItem
                    key={row.symbol}
                    row={row}
                    variant="conviction"
                  />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-600">
                  Žiadny altcoin neprešiel RSI filtrom (&lt; 50).
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <X className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-[11px] font-semibold text-rose-400">
                Vylúčené (filter)
              </span>
              <span className="text-[10px] text-zinc-600">
                ({bucketing.yieldAltcoins.excluded.length})
              </span>
            </div>
            <div className="space-y-2">
              {bucketing.yieldAltcoins.excluded.map((row) => (
                <YieldAltcoinRowItem
                  key={row.symbol}
                  row={row}
                  variant="excluded"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Narrative */}
      <div className="mt-6 rounded-xl border border-white/5 bg-[#0a0a0c] px-4 py-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Prečo? — Narratív posunu
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {bucketing.narrativeBullets.map((bullet) => (
            <li
              key={bullet}
              className="flex gap-2 text-[11px] leading-relaxed text-zinc-500"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
              {bullet}
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
