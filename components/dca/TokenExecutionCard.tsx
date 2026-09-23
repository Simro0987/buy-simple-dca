"use client";

import { motion } from "framer-motion";
import { ChevronDown, Lock, OctagonMinus } from "lucide-react";
import { LaserBar } from "@/components/dca/LaserBar";
import { formatUnitPrice, formatUsd } from "@/lib/data";
import {
  LIMIT_ROLLOVER_NOTE,
  LIMIT_VALIDITY_DAYS,
} from "@/lib/dca/executionMath";
import { formatApy, formatEstimatedQty, formatPercent } from "@/lib/dca/format";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import {
  approvedBadge,
  compactChip,
  stoppedBadge,
  tokenUnderglow,
} from "@/lib/dca/terminal";
import type {
  BrakeBoostMode,
  DcaSymbol,
  ExecutionStatus,
  HighBetaCheckItem,
  HighBetaEvaluation,
  LimitLeg,
  SatelliteEvaluation,
  TokenExecutionPlan,
} from "@/lib/dca/types";
import { CopyGlyph } from "@/components/dca/CopyGlyph";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { interactiveButton } from "@/lib/motion";
import {
  copyPrice,
  copyQty,
  copyUsd,
  formatCountdown,
  formatLockedDistance,
  formatSpotDistance,
  type PendingOrder,
  type PortfolioAssetRecord,
} from "@/lib/dca/executionLedger";

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

const brakeBoostBadgeClass: Record<BrakeBoostMode, string> = {
  REDUCE: "border-amber-400/40 bg-amber-400/15 text-amber-200",
  BOOST: "border-lime-400/40 bg-lime-400/15 text-lime-300",
  DEEP_BOOST: "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_12px_rgba(232,121,249,0.35)]",
  NORMAL: "border-white/10 bg-white/5 text-zinc-400",
};

interface TokenExecutionCardProps {
  plan: TokenExecutionPlan;
  loading?: boolean;
  pendingLimit?: PendingOrder | null;
  marketFill?: PortfolioAssetRecord | null;
  limitFill?: PortfolioAssetRecord | null;
  nowMs?: number;
  onCopied?: (message: string) => void;
  onActivateMarket: (symbol: DcaSymbol) => void;
  onActivateLimit: (symbol: DcaSymbol, leg: LimitLeg) => void;
  onFillPending: (id: string) => void;
  onCancelPending: (id: string) => void;
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

function LimitTrack({
  title,
  shareLabel,
  usd,
  qty,
  price,
  livePrice,
  symbol,
  targetLabel,
  fallbackActive,
  atrMult,
  pending,
  fill,
  nowMs,
  onCopied,
  onActivate,
  onFillPending,
  onCancelPending,
}: {
  title: string;
  shareLabel: string;
  usd: number;
  qty: number;
  price: number;
  livePrice: number;
  symbol: DcaSymbol;
  targetLabel: string;
  fallbackActive: boolean;
  atrMult: number;
  pending: PendingOrder | null;
  fill: PortfolioAssetRecord | null;
  nowMs: number;
  onCopied?: (message: string) => void;
  onActivate: () => void;
  onFillPending: (id: string) => void;
  onCancelPending: (id: string) => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        pending
          ? "border-amber-400/70 bg-amber-400/12 shadow-[0_0_28px_rgba(251,191,36,0.55)]"
          : fill
            ? "border-emerald-400/50 bg-emerald-400/12 shadow-[0_0_22px_rgba(52,211,153,0.28)]"
            : "border-amber-400/20 bg-amber-400/8"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
        {title} · <span className="font-mono">{shareLabel}</span>
      </p>
      {(pending || fill) && (
        <span
          className={`action-lock mt-1 inline-flex rounded-sm border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
            pending
              ? "border-[#00FFA3]/70 bg-[#00FFA3]/15 text-[#00FFA3]"
              : "border-[#00FFA3]/50 bg-[#00FFA3]/18 text-[#00FFA3]"
          }`}
        >
          {pending ? "Čaká na burze (7d)" : "Zrealizované"}
        </span>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="font-mono text-sm font-bold text-white">{formatUsd(usd)}</p>
        <CopyGlyph
          label="Kopírovať Kapitál (USD)"
          value={copyUsd(usd)}
          onCopied={onCopied}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="text-[10px] text-zinc-400">
          ≈ {formatEstimatedQty(qty, symbol)}
        </p>
        <CopyGlyph
          label="Kopírovať Počet tokenov"
          value={copyQty(qty, symbol)}
          onCopied={onCopied}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-amber-100">
          Limit {formatUnitPrice(price || 0)}
        </p>
        <CopyGlyph
          label="Kopírovať LMT Cenu"
          value={copyPrice(price)}
          onCopied={onCopied}
        />
      </div>
      {pending ? (
        <div className="mt-1.5 space-y-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-2 py-1.5 shadow-[0_0_18px_rgba(251,191,36,0.35)]">
          <p className="text-[8px] font-bold uppercase tracking-wide text-amber-100">
            Active Limit Tracker
          </p>
          <p className="text-[10px] text-amber-50">
            Lock {formatUnitPrice(pending.lockedLimitPrice)}
          </p>
          <p className="text-[10px] tabular-nums text-amber-100">
            {formatLockedDistance(pending.lockedLimitPrice, livePrice)}
          </p>
          <p className="text-[10px] font-semibold text-amber-50">
            {formatCountdown(pending.expiresAt, nowMs)}
          </p>
          <div className="grid grid-cols-2 gap-1 pt-1">
            <motion.button
              type="button"
              onClick={() => onFillPending(pending.id)}
              {...interactiveButton}
              className="rounded-lg bg-emerald-400 px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-zinc-950"
            >
              Zrealizovalo sa
            </motion.button>
            <motion.button
              type="button"
              onClick={() => onCancelPending(pending.id)}
              {...interactiveButton}
              className="rounded-lg border border-white/15 bg-white/5 px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-zinc-200"
            >
              Zrušiť
            </motion.button>
          </div>
        </div>
      ) : fill ? (
        <p className="mt-2 text-[10px] leading-relaxed text-emerald-200/90">
          {formatUsd(fill.spentUsd)} @ {formatUnitPrice(fill.priceUsd)}
        </p>
      ) : (
        <>
          <p className="text-[10px] tabular-nums text-zinc-400">
            {formatSpotDistance(price, livePrice)}
          </p>
          {fallbackActive ? (
            <div className="mt-1 rounded-xl border border-amber-400/40 bg-amber-500/15 px-2 py-1.5">
              <p className="text-[8px] font-bold uppercase tracking-wide text-amber-200">
                Fallback aktívny
              </p>
              <p className="text-[10px] text-amber-100">
                {formatUnitPrice(price)} · Live − {atrMult.toFixed(2)}× ATR
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-500">{targetLabel}</p>
          )}
          <motion.button
            type="button"
            onClick={onActivate}
            disabled={usd <= 0 || price <= 0}
            {...interactiveButton}
            className="mt-2 w-full rounded-sm border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Aktivovať LMT
          </motion.button>
          <p className="mt-1 text-[8px] uppercase tracking-[0.16em] text-zinc-600">
            Platnosť príkazu: {LIMIT_VALIDITY_DAYS} dní
          </p>
          <p className="mt-0.5 text-[8px] leading-relaxed text-zinc-700">
            {LIMIT_ROLLOVER_NOTE}
          </p>
        </>
      )}
    </div>
  );
}

function RsiGauge({ rsi }: { rsi: number }) {
  const left = Math.min(98, Math.max(2, rsi));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>RSI 14D</span>
        <span className="font-mono font-bold text-white">{rsi.toFixed(1)}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden bg-gradient-to-r from-cyan-400 via-emerald-400 to-pink-500">
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
  pendingLimit = null,
  marketFill = null,
  limitFill = null,
  nowMs = Date.now(),
  onCopied,
  onActivateMarket,
  onActivateLimit,
  onFillPending,
  onCancelPending,
}: TokenExecutionCardProps) {
  const highBeta = plan.highBeta;
  const satellite = plan.satellite;
  const highBetaRejected = Boolean(highBeta && !highBeta.approved);
  const highBetaApproved = Boolean(highBeta && highBeta.approved);
  const satellitePaused = Boolean(satellite && !satellite.approved);
  const locked = !plan.gate.passed;
  const liveMarketQty = plan.price > 0 ? plan.marketUsd / plan.price : 0;
  const mktUsd = marketFill?.spentUsd ?? plan.marketUsd;
  const mktQty = marketFill?.tokenVolume ?? liveMarketQty;
  const lmtUsd =
    pendingLimit?.spentUsd ?? limitFill?.spentUsd ?? (plan.limit1Usd || plan.limitUsd);
  const lmtQty =
    pendingLimit?.tokenVolume ??
    limitFill?.tokenVolume ??
    (plan.limitPrice > 0 ? plan.limitUsd / plan.limitPrice : plan.limitQty);
  const lmtPrice =
    pendingLimit?.lockedLimitPrice ??
    limitFill?.priceUsd ??
    (plan.limit1Price || plan.limitPrice);
  const showMarketPane = !locked || Boolean(marketFill);
  const showLimitPane = !locked || Boolean(pendingLimit) || Boolean(limitFill);
  const showExecution = showMarketPane || showLimitPane;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glassPanel} p-4 ${tokenUnderglow[plan.symbol] ?? ""} ${
        plan.gate.passed
          ? "shadow-[inset_0_0_28px_rgba(0,255,163,0.07)]"
          : "border-[#FF2A6D]/80"
      } ${
        plan.smartTrim
          ? "border-amber-400/60 shadow-[0_0_28px_rgba(251,191,36,0.28)]"
          : plan.fallingKnife
            ? "border-[#FF2A6D]"
            : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-gradient-to-br from-white/20 to-white/5 font-mono text-xs font-bold text-white ring-1 ring-white/15">
            {plan.symbol.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-base font-bold tracking-tight text-white">{plan.symbol}</p>
              <span
                className={plan.gate.passed ? approvedBadge : stoppedBadge}
              >
                {!plan.gate.passed && <Lock className="h-3 w-3" />}
                {plan.gate.badge}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{plan.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className={compactChip}>{categoryCopy[plan.category]}</span>
              {plan.subTags.map((tag) => (
                <span key={tag} className={compactChip}>
                  {tag}
                </span>
              ))}
              {plan.bullMarket && <span className={compactChip}>Býčí</span>}
              {!locked && <span className={compactChip}>{statusCopy[plan.status]}</span>}
              {plan.gate.passed && plan.basketWeightPercent > 0 && plan.category !== "CORE" && (
                <span className={`${compactChip} font-mono text-violet-200`}>
                  {plan.basketWeightPercent.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {plan.absorbedUsd > 0 && (
            <p className="mb-1 font-mono text-[10px] font-black uppercase tracking-wide text-[#00FFA3] drop-shadow-[0_0_8px_rgba(0,255,163,0.55)]">
              +{plan.absorbedUsd.toFixed(0)} $ PRESMEROVANÉ
            </p>
          )}
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Podiel nasadeného
          </p>
          <p className="font-mono text-lg font-bold text-[#00FFA3]">
            {formatPercent(plan.weightPercent, 0)}
          </p>
          <p className="font-mono text-xs text-white">{formatUsd(plan.totalUsd)}</p>
          <p className="font-mono text-[10px] text-zinc-500">
            {loading ? (
              <PriceSkeleton className="ml-auto h-3 w-16" />
            ) : (
              <>Live {formatUnitPrice(plan.price)}</>
            )}
          </p>
        </div>
      </div>

      {plan.smartTrim && (
        <div className="mb-3 space-y-1 rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-rose-500/10 px-3 py-2 shadow-[0_0_22px_rgba(251,191,36,0.25)]">
          <p className="text-[12px] font-bold uppercase tracking-wide text-amber-100">
            {plan.smartTrim.headline}
          </p>
          <p className="text-[11px] font-medium leading-relaxed text-amber-50/90">
            {plan.smartTrim.detail}
          </p>
          <p className="text-[10px] text-amber-200/70">Len návrh — žiadny automatický predaj.</p>
        </div>
      )}
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
        <div className="mb-3 space-y-1 border border-[#FF2A6D] bg-[rgba(255,42,109,0.12)] px-3 py-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#FF2A6D]">
            ⚠️ NÁKUP ZAMIETNUTÝ (Skóre {highBeta.score}/3)
          </p>
          <p className="text-[11px] font-medium leading-relaxed text-amber-100/90">
            Dôvod: {highBeta.reason}. {formatUsd(plan.highBetaRedirectedUsd)}{" "}
            presmerovaných do {plan.waterfallDestination || "Core (BTC)"}.
          </p>
        </div>
      )}
      {satellitePaused && satellite && (
        <div className="mb-3 space-y-1 border border-[#FF2A6D] bg-[rgba(255,42,109,0.12)] px-3 py-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#FF2A6D]">
            ⏸️ DCA POZASTAVENÉ
          </p>
          <p className="text-[11px] font-medium leading-relaxed text-cyan-100/90">
            Dôvod: {satellite.reason} {formatUsd(plan.satelliteRedirectedUsd)}{" "}
            presmerovaných do {plan.waterfallDestination || "Core (BTC)"}.
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
        {!locked && plan.brakeBoostMode !== "NORMAL" && (
          <div className={`${glassInset} col-span-2 flex items-center gap-3 p-2.5`}>
            <OctagonMinus className="h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                Brzda & Boost
              </p>
              <p className="font-mono text-lg font-black tracking-tight text-amber-300">
                {plan.brakeBoostMode === "REDUCE"
                  ? `REDUCE MKT ${plan.brakeBoostFactor.toFixed(0)}%`
                  : `${plan.brakeBoostMode === "DEEP_BOOST" ? "DEEP BOOST" : "BOOST"} MKT × ${(plan.brakeBoostFactor * 100).toFixed(0)}%`}
              </p>
            </div>
          </div>
        )}
      </div>

      {showExecution && (
        <>
          {!locked && (
            <>
              <RsiGauge rsi={plan.rsi} />

              <div className="mt-3 mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
                <span className="font-mono text-[#00FFA3]">
                  MKT {formatPercent(plan.marketShare, 0)}
                </span>
                <span className="text-zinc-600">RSI · MKT / LMT</span>
                <span className="font-mono text-amber-300">
                  LMT {formatPercent(plan.limitShare, 0)}
                </span>
              </div>
              <div className="mb-2">
                <LaserBar
                  segments={[
                    { width: plan.marketShare, tone: "approved" },
                    { width: plan.limitShare, tone: "amber" },
                  ]}
                />
              </div>
            </>
          )}

          <div className={`space-y-2 ${locked ? "mt-3" : ""}`}>
            {showMarketPane && (
            <div
              className={`rounded-2xl border p-3 ${
                marketFill
                  ? "border-emerald-400/50 bg-emerald-400/12 shadow-[0_0_22px_rgba(52,211,153,0.28)]"
                  : "border-emerald-400/20 bg-emerald-400/8"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                MKT · {formatPercent(plan.marketShare, 0)}
              </p>
              {plan.brakeBoostBadge && (
                <span
                  className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${brakeBoostBadgeClass[plan.brakeBoostMode]}`}
                >
                  {plan.brakeBoostBadge}
                </span>
              )}
              {marketFill && (
                <span className="mt-1 ml-1 inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-200">
                  Zrealizované
                </span>
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-bold text-white transition-all duration-500">
                  {formatUsd(mktUsd)}
                </p>
                <CopyGlyph
                  label="Kopírovať Kapitál (USD)"
                  value={copyUsd(mktUsd)}
                  onCopied={onCopied}
                />
              </div>
              {plan.brakeBoostMode !== "NORMAL" && !marketFill && (
                <p className="text-[9px] text-zinc-500">
                  Pôvodne {formatUsd(plan.originalMarketUsd)}
                  {plan.brakeBoostReserveDelta > 0
                    ? ` · +${formatUsd(plan.brakeBoostReserveDelta)} → Dostupný Kapitál`
                    : plan.brakeBoostReserveDelta < 0
                      ? ` · ${formatUsd(plan.brakeBoostReserveDelta, { showSign: true })} ← Dostupný Kapitál`
                      : ""}
                </p>
              )}
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="text-[10px] text-zinc-400">
                  ≈ {formatEstimatedQty(mktQty, plan.symbol)}
                </p>
                <CopyGlyph
                  label="Kopírovať Počet tokenov"
                  value={copyQty(mktQty, plan.symbol)}
                  onCopied={onCopied}
                />
              </div>
              <p className="mt-1 text-[10px] tabular-nums text-zinc-500">
                Live {plan.price ? formatUnitPrice(plan.price) : "—"}
              </p>
              {marketFill ? (
                <motion.button
                  type="button"
                  disabled
                  className="action-lock mt-2 w-full rounded-sm border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide"
                >
                  Zrealizované
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={() => onActivateMarket(plan.symbol)}
                  disabled={plan.marketUsd <= 0 || plan.price <= 0}
                  {...interactiveButton}
                  className="mt-2 w-full rounded-sm border border-[#00FFA3]/30 bg-[#00FFA3]/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#00FFA3] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Aktivovať Market
                </motion.button>
              )}
            </div>
            )}
            {showLimitPane && (
              <LimitTrack
                title="LMT"
                shareLabel={formatPercent(plan.limitShare, 0)}
                usd={lmtUsd}
                qty={lmtQty}
                price={lmtPrice}
                livePrice={plan.price}
                symbol={plan.symbol}
                targetLabel={plan.limit1TargetLabel || plan.limitTargetLabel}
                fallbackActive={plan.limit1FallbackActive}
                atrMult={plan.limit1AtrMult}
                pending={pendingLimit}
                fill={limitFill}
                nowMs={nowMs}
                onCopied={onCopied}
                onActivate={() => onActivateLimit(plan.symbol, "lmt1")}
                onFillPending={onFillPending}
                onCancelPending={onCancelPending}
              />
            )}
          </div>
        </>
      )}

      {highBeta && <HighBetaAnalytics evaluation={highBeta} />}
      {satellite && <SatelliteAnalytics evaluation={satellite} />}
    </motion.article>
  );
}
