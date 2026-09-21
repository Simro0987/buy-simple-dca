"use client";

import { motion } from "framer-motion";
import { ChevronDown, Lock } from "lucide-react";
import { formatUnitPrice, formatUsd } from "@/lib/data";
import { formatApy, formatEstimatedQty, formatPercent } from "@/lib/dca/format";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import type {
  DcaSymbol,
  ExecutionStatus,
  HighBetaCheckItem,
  HighBetaEvaluation,
  SatelliteEvaluation,
  TokenExecutionPlan,
} from "@/lib/dca/types";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { interactiveButton } from "@/lib/motion";

const categoryCopy = {
  CORE: "CORE",
  SATELLITE: "SATELLITE",
  HIGH_BETA: "HIGH BETA",
} as const;

const statusCopy: Record<ExecutionStatus, string> = {
  REDUCE: "REDUCE",
  NORMAL: "NORMAL",
  DEEP_BOOST: "DEEP BOOST",
};

const statusClass: Record<ExecutionStatus, string> = {
  REDUCE: "border-pink-400/40 bg-pink-500/15 text-pink-300",
  NORMAL: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  DEEP_BOOST: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
};

interface TokenExecutionCardProps {
  plan: TokenExecutionPlan;
  loading?: boolean;
  marketActive?: boolean;
  limitActive?: boolean;
  onActivateMarket: (symbol: DcaSymbol) => void;
  onActivateLimit: (symbol: DcaSymbol) => void;
}

function CheckRow({ item }: { item: HighBetaCheckItem }) {
  return (
    <li className="flex items-start gap-2 text-[11px] leading-relaxed">
      <span className={item.passed ? "text-emerald-400" : "text-rose-400"}>
        {item.passed ? "✅" : "❌"}
      </span>
      <span>
        <span className="font-semibold text-zinc-200">{item.label}</span>
        <span className="block text-zinc-500">{item.detail}</span>
      </span>
    </li>
  );
}

function HighBetaAnalytics({ evaluation }: { evaluation: HighBetaEvaluation }) {
  return (
    <details className="group mt-3 rounded-2xl border border-white/10 bg-zinc-950/40 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-300 [&::-webkit-details-marker]:hidden">
        Analytické detaily
        <ChevronDown className="h-4 w-4 text-zinc-500 transition group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">
        {[
          { index: 0, step: evaluation.checklist.step0, extra: "" },
          { index: 1, step: evaluation.checklist.step1, extra: "" },
          {
            index: 2,
            step: evaluation.checklist.step2,
            extra: ` · ${evaluation.checklist.step2.score}/3`,
          },
        ].map(({ index, step, extra }) => (
          <div key={step.label} className={`${glassInset} p-2.5`}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Krok {index} · {step.label}
              {extra} ·{" "}
              <span className={step.passed ? "text-emerald-400" : "text-rose-400"}>
                {step.passed ? "PASS" : "FAIL"}
              </span>
            </p>
            <ul className="space-y-1.5">
              {step.items.map((item) => (
                <CheckRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ))}
        <p className="px-0.5 text-[11px] leading-relaxed text-zinc-400">
          {evaluation.approved
            ? `Skóre ${evaluation.score}/3 — nákup schválený, jednorazová exekúcia cez MKT alebo LMT.`
            : `Skóre ${evaluation.score}/3 — nákup zamietnutý, kapitál sa dynamicky presúva do Core (BTC).`}
        </p>
      </div>
    </details>
  );
}

function SatelliteAnalytics({ evaluation }: { evaluation: SatelliteEvaluation }) {
  const step1Status = evaluation.checklist.step1.skipped
    ? "SKIP"
    : evaluation.checklist.step1.passed
      ? "PASS"
      : "FAIL";
  const step1Color = evaluation.checklist.step1.skipped
    ? "text-cyan-300"
    : evaluation.checklist.step1.passed
      ? "text-emerald-400"
      : "text-rose-400";

  return (
    <details className="group mt-3 rounded-2xl border border-white/10 bg-zinc-950/40 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-300 [&::-webkit-details-marker]:hidden">
        Analytické detaily
        <ChevronDown className="h-4 w-4 text-zinc-500 transition group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">
        <div className={`${glassInset} p-2.5`}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Krok 0 · {evaluation.checklist.step0.label} ·{" "}
            <span
              className={
                evaluation.checklist.step0.passed ? "text-emerald-400" : "text-rose-400"
              }
            >
              {evaluation.checklist.step0.passed ? "PASS" : "FAIL"}
            </span>
          </p>
          <ul className="space-y-1.5">
            {evaluation.checklist.step0.items.map((item) => (
              <CheckRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
        <div className={`${glassInset} p-2.5`}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Krok 1 · {evaluation.checklist.step1.label} ·{" "}
            <span className={step1Color}>{step1Status}</span>
          </p>
          <ul className="space-y-1.5">
            {evaluation.checklist.step1.items.map((item) => (
              <CheckRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function RsiGauge({ rsi }: { rsi: number }) {
  const left = Math.min(98, Math.max(2, rsi));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>RSI 14D</span>
        <span className="font-bold text-white">{rsi.toFixed(1)}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-pink-500">
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-950 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
          style={{ left: `${left}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-wider text-zinc-600">
        <span>0–30</span>
        <span>30–70</span>
        <span>70–100</span>
      </div>
    </div>
  );
}

export function TokenExecutionCard({
  plan,
  loading = false,
  marketActive = false,
  limitActive = false,
  onActivateMarket,
  onActivateLimit,
}: TokenExecutionCardProps) {
  const highBeta = plan.highBeta;
  const satellite = plan.satellite;
  const highBetaRejected = Boolean(highBeta && !highBeta.approved);
  const highBetaApproved = Boolean(highBeta && highBeta.approved);
  const satellitePaused = Boolean(satellite && !satellite.approved);
  const locked = highBetaRejected || satellitePaused;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glassPanel} p-4 ${highBetaRejected ? "border-amber-500/30" : satellitePaused ? "border-cyan-500/30" : ""}`}
    >
      <div className={`mb-3 flex items-start justify-between gap-3 ${locked ? "opacity-55 grayscale" : ""}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-white/20 to-white/5 text-xs font-bold text-white ring-1 ring-white/20">
            {plan.symbol.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-base font-bold text-white">{plan.symbol}</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-300">
                {categoryCopy[plan.category]}
              </span>
              {plan.subTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{plan.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {plan.bullMarket && (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                  Býčí trh · cena &gt; SMA 200
                </span>
              )}
              {!locked && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusClass[plan.status]}`}
                >
                  {statusCopy[plan.status]}
                </span>
              )}
              {locked && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-rose-500/20 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-200">
                  <Lock className="h-3 w-3" />
                  Zamknuté
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Týždenný podiel
          </p>
          <p className="text-lg font-bold text-emerald-300">
            {formatPercent(plan.weightPercent, 0)}
          </p>
          <p className="text-xs text-white">{formatUsd(plan.totalUsd)}</p>
          <p className="text-[10px] text-zinc-500">
            {loading ? (
              <PriceSkeleton className="ml-auto h-3 w-16" />
            ) : (
              <>Live {formatUnitPrice(plan.price)}</>
            )}
          </p>
        </div>
      </div>

      {highBetaApproved && highBeta && (
        <div className="mb-3 space-y-1 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 shadow-[0_0_18px_rgba(52,211,153,0.25)]">
          <p className="text-[12px] font-bold uppercase tracking-wide text-emerald-300">
            ✅ NÁKUP SCHVÁLENÝ (Skóre {highBeta.score}/3)
          </p>
          <p className="text-[11px] font-medium leading-relaxed text-emerald-100/90">
            Jednorazový nákup ihneď cez MKT alebo LMT.
          </p>
        </div>
      )}
      {highBetaRejected && highBeta && (
        <div className="mb-3 space-y-1 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-rose-500/10 px-3 py-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-amber-200">
            ⚠️ NÁKUP ZAMIETNUTÝ (Skóre {highBeta.score}/3)
          </p>
          <p className="text-[11px] font-medium leading-relaxed text-amber-100/90">
            Dôvod: {highBeta.reason}. {formatUsd(plan.highBetaRedirectedUsd)}{" "}
            dynamicky presmerovaných do Core (BTC).
          </p>
        </div>
      )}
      {satellitePaused && satellite && (
        <div className="mb-3 space-y-1 rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-slate-900/40 px-3 py-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-cyan-200">
            ⏸️ DCA POZASTAVENÉ
          </p>
          <p className="text-[11px] font-medium leading-relaxed text-cyan-100/90">
            Dôvod: {satellite.reason} {formatUsd(plan.satelliteRedirectedUsd)}{" "}
            presmerovaných do Core (BTC).
          </p>
        </div>
      )}

      <div className={`mb-3 grid grid-cols-2 gap-2 ${locked ? "opacity-50 grayscale" : ""}`}>
        <div className={`${glassInset} p-2.5`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Trend
          </p>
          <p className="mt-1 text-[11px] text-zinc-300">
            50D EMA {plan.ema50 ? formatUnitPrice(plan.ema50) : "—"}
          </p>
          <p className="text-[11px] text-zinc-400">
            200D SMA {plan.sma200 ? formatUnitPrice(plan.sma200) : "—"} ·{" "}
            {formatPercent(plan.sma200DevPct)}
          </p>
        </div>
        <div className={`${glassInset} p-2.5`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Yield
          </p>
          <p className="mt-1 text-[11px] text-zinc-300">
            APY {formatApy(plan.yieldApy)}
          </p>
          <p className="text-[11px] text-zinc-400">
            IL R/R {plan.ilRr}
            {plan.yieldProject ? ` · ${plan.yieldProject}` : ""}
          </p>
        </div>
        <div className={`${glassInset} col-span-2 p-2.5`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Volatilita
          </p>
          <p className="mt-1 text-[11px] text-zinc-300">
            ATR pás 2.5× {plan.atrBand ? formatUnitPrice(plan.atrBand) : "—"}
          </p>
          <p className="text-[11px] text-zinc-400">
            S1 {plan.s1 ? formatUnitPrice(plan.s1) : "—"} · R1{" "}
            {plan.r1 ? formatUnitPrice(plan.r1) : "—"}
          </p>
        </div>
      </div>

      {!locked && (
        <>
          <RsiGauge rsi={plan.rsi} />

          <div className="mt-3 mb-2 flex h-2.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${plan.marketShare}%` }}
            />
            <div
              className="h-full bg-amber-400"
              style={{ width: `${plan.limitShare}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/8 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                MKT · {formatPercent(plan.marketShare, 0)}
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {formatUsd(plan.marketUsd)}
              </p>
              <p className="text-[10px] text-zinc-400">
                {formatEstimatedQty(plan.marketQty, plan.symbol)}
              </p>
              <motion.button
                type="button"
                onClick={() => onActivateMarket(plan.symbol)}
                {...interactiveButton}
                className={`mt-2 w-full rounded-xl px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                  marketActive
                    ? "bg-emerald-400 text-zinc-950"
                    : "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                }`}
              >
                {marketActive ? "Market aktívny" : "Aktivovať Market"}
              </motion.button>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  LMT · {formatPercent(plan.limitShare, 0)}
                </p>
                <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-200">
                  Smart zľava {plan.discountPct.toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 text-sm font-bold text-white">
                {formatUsd(plan.limitUsd)}
              </p>
              <p className="text-[10px] text-zinc-400">
                {formatEstimatedQty(plan.limitQty, plan.symbol)}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">
                Limit {plan.limitPrice ? formatUnitPrice(plan.limitPrice) : "—"}
              </p>
              <motion.button
                type="button"
                onClick={() => onActivateLimit(plan.symbol)}
                {...interactiveButton}
                className={`mt-2 w-full rounded-xl px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                  limitActive
                    ? "bg-amber-400 text-zinc-950"
                    : "border border-amber-400/30 bg-amber-400/10 text-amber-200"
                }`}
              >
                {limitActive ? "Limit aktívny" : "Aktivovať Limit"}
              </motion.button>
            </div>
          </div>
        </>
      )}

      {highBeta && <HighBetaAnalytics evaluation={highBeta} />}
      {satellite && <SatelliteAnalytics evaluation={satellite} />}
    </motion.article>
  );
}
