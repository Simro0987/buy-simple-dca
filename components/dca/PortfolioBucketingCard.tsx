"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Shield, X } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUsd } from "@/lib/data";
import type {
  PortfolioBucketingResult,
  TokenAllocationRow,
  YieldAltcoinRow,
  YieldExcludedRow,
} from "@/lib/dcaPortfolioBucketing";

interface PortfolioBucketingCardProps {
  bucketing: PortfolioBucketingResult | null;
  loading?: boolean;
  metricsError?: string | null;
  section?: "all" | "macro" | "tokens";
}

const listTransition = {
  layout: { duration: 0.7, ease: [0.4, 0, 0.2, 1] as const },
  opacity: { duration: 0.5 },
};

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
    <p
      className={`text-center text-[11px] font-semibold tabular-nums transition-all duration-700 ease-out ${textClass}`}
    >
      {Math.round(percent)}% • {formatUsd(animatedAmount)}
    </p>
  );
}

function TokenRow({ row }: { row: TokenAllocationRow }) {
  const animatedAmount = useCountUp(row.amountUsd, 700);
  const barWidth = Math.min(100, Math.max(4, row.percentOfTotal));

  return (
    <motion.div
      layout
      transition={listTransition.layout}
      className="rounded-2xl border border-white/5 bg-[#0a0a0c] px-3.5 py-3 transition-all duration-700 ease-out"
    >
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
          <p
            className={`text-sm font-bold tabular-nums transition-colors duration-700 ${row.textClass}`}
          >
            {formatUsd(animatedAmount)}
          </p>
          <p className="text-[10px] text-zinc-500">
            {row.percentOfTotal.toFixed(1)}% celku
          </p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <motion.div
          layout
          className={`h-full rounded-full transition-all duration-700 ease-out ${row.barClass}`}
          style={{ width: `${barWidth}%` }}
          transition={listTransition.layout}
        />
      </div>
    </motion.div>
  );
}

function FilterDots({ conditions }: { conditions: YieldExcludedRow["conditions"] }) {
  return (
    <div className="flex items-center gap-1">
      {conditions.map((condition) => (
        <span
          key={condition.id}
          title={condition.detail}
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-700 ${
            condition.passed
              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
              : "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]"
          }`}
        />
      ))}
    </div>
  );
}

function YieldAltcoinRowItem({
  row,
  variant,
}: {
  row: YieldAltcoinRow | YieldExcludedRow;
  variant: "conviction" | "excluded";
}) {
  const isConviction = variant === "conviction";
  const convictionRow = isConviction ? (row as YieldAltcoinRow) : null;
  const animatedAmount = useCountUp(convictionRow?.amountUsd ?? 0, 700);
  const barWidth = isConviction
    ? Math.max(12, convictionRow?.shareOfYieldPercent ?? 0)
    : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={listTransition.layout}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-700 ease-out ${
        isConviction
          ? "border-teal-500/20 bg-teal-500/5"
          : "border-white/5 bg-zinc-900/40 opacity-60"
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-colors duration-700 ${
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
            className={`text-xs font-bold transition-colors duration-700 ${
              isConviction ? "text-white" : "text-zinc-500"
            }`}
          >
            {row.symbol}
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-500">
            {row.tag}
          </span>
          {!isConviction && (
            <FilterDots conditions={(row as YieldExcludedRow).conditions} />
          )}
        </div>

        {isConviction && convictionRow ? (
          <>
            <p className="mt-0.5 text-[10px] text-teal-400/80 transition-colors duration-700">
              Filter 3/3 • skóre {convictionRow.convictionScore} • váha{" "}
              {convictionRow.convictionScore}^2.5
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
              <motion.div
                layout
                className="h-full rounded-full bg-teal-400 transition-all duration-700 ease-out"
                style={{ width: `${barWidth}%` }}
                transition={listTransition.layout}
              />
            </div>
          </>
        ) : (
          <div className="mt-1 space-y-0.5">
            {(row as YieldExcludedRow).failureReasons.map((reason) => (
              <p
                key={reason}
                className="text-[10px] text-rose-400/80 transition-colors duration-700"
              >
                {reason}
              </p>
            ))}
            {(row as YieldExcludedRow).filtersPassedCount > 0 && (
              <p className="text-[9px] text-zinc-600">
                Filter {(row as YieldExcludedRow).filtersPassedCount}/3
              </p>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        {isConviction && convictionRow ? (
          <p className="text-xs font-bold tabular-nums text-teal-400 transition-all duration-700">
            {formatUsd(animatedAmount)}
          </p>
        ) : (
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] transition-all duration-700" />
        )}
      </div>
    </motion.div>
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
          layout
          initial={false}
          animate={{ width: `${Math.max(0, bucket.percent)}%` }}
          transition={listTransition.layout}
          className={`h-full ${bucket.barClass} transition-colors duration-700 first:rounded-l-full last:rounded-r-full`}
          title={`${bucket.label} ${bucket.percent}%`}
        />
      ))}
    </div>
  );
}

export function PortfolioBucketingCard({
  bucketing,
  loading = false,
  metricsError = null,
  section = "all",
}: PortfolioBucketingCardProps) {
  if (!bucketing) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5"
      >
        <PriceSkeleton className="h-8 w-full rounded-xl" />
        <PriceSkeleton className="mt-4 h-4 w-full rounded-lg" />
        <PriceSkeleton className="mt-3 h-3.5 w-full rounded-full" />
      </motion.section>
    );
  }

  const showMacro = section === "all" || section === "macro";
  const showTokens = section === "all" || section === "tokens";

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
      className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-5"
    >
      {showMacro && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-400 transition-all duration-700">
              <Shield className="h-3.5 w-3.5" />
              {bucketing.badgeTitle}
            </span>
            <span className="text-[11px] font-medium text-zinc-500 transition-all duration-700">
              {bucketing.badgeSubtitle}
            </span>
          </div>

          {bucketing.spilloverActive && (
            <motion.p
              layout
              className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-400/90 transition-all duration-700"
            >
              Spillover aktívny — {formatUsd(bucketing.spilloverAmount)} z Yield
              presunuté do CORE/SATELLITES (žiadny token neprešiel filtrom 3/3).
            </motion.p>
          )}

          <div className="mt-5 flex justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.14em]">
            {bucketing.buckets.map((bucket) => (
              <span
                key={bucket.category}
                className={`transition-colors duration-700 ${bucket.textClass}`}
              >
                {bucket.label} • {bucket.subtitle}
              </span>
            ))}
          </div>

          <div className="mt-3">
            <MultiColorSplitBar buckets={bucketing.buckets} />
          </div>

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
        </>
      )}

      {showTokens && (
        <>
          <div
            className={`${showMacro ? "mt-6 border-t border-white/5 pt-5" : ""}`}
          >
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

      <div className="mt-6 border-t border-white/5 pt-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Yield • High-Conviction
          </p>
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500 transition-all duration-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Načítavam live metriky…
            </span>
          )}
        </div>

        {metricsError && !loading && (
          <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[10px] text-rose-400/90 transition-all duration-700">
            {metricsError} — filter používa posledné dostupné dáta.
          </p>
        )}

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
            <motion.div layout className="space-y-2">
              <AnimatePresence mode="popLayout">
                {bucketing.yieldAltcoins.conviction.length > 0 ? (
                  bucketing.yieldAltcoins.conviction.map((row) => (
                    <YieldAltcoinRowItem
                      key={row.symbol}
                      row={row}
                      variant="conviction"
                    />
                  ))
                ) : (
                  <motion.p
                    key="empty-conviction"
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-600 transition-all duration-700"
                  >
                    Žiadny altcoin neprešiel filtrom 3/3 — kapitál presunutý do
                    CORE/SATELLITES.
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold text-rose-400">
              ► Vylúčené filtrom ({bucketing.yieldAltcoins.excluded.length}) —
              prečo
            </p>
            <p className="mb-2 text-[10px] leading-relaxed text-zinc-600">
              Filter 3/3: RSI &lt; 50 • cena ≥ −10 % vs SMA14 • fundament ≥
              50. High-Conviction váha = skóre^2.5. Ak žiadny token neprejde,
              zvyšok sa vracia do CORE/SATELLITES.
            </p>
            <motion.div layout className="space-y-2">
              <AnimatePresence mode="popLayout">
                {bucketing.yieldAltcoins.excluded.map((row) => (
                  <YieldAltcoinRowItem
                    key={row.symbol}
                    row={row}
                    variant="excluded"
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/5 bg-[#0a0a0c] px-4 py-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Prečo? — Narratív posunu
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {bucketing.narrativeBullets.map((bullet) => (
            <motion.li
              key={bullet}
              layout
              className="flex gap-2 text-[11px] leading-relaxed text-zinc-500 transition-all duration-700"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
              {bullet}
            </motion.li>
          ))}
        </ul>
      </div>
        </>
      )}
    </motion.section>
  );
}
