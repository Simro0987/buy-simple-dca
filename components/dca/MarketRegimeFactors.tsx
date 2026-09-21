"use client";

import { motion } from "framer-motion";
import {
  MARKET_REGIME_FACTORS,
  summarizeMarketRegime,
  type RegimeFactor,
  type RegimeSignal,
} from "@/lib/dcaEngineConfig";

const signalCopy: Record<RegimeSignal, string> = {
  bullish: "býčí",
  neutral: "neutrálny",
  bearish: "medvedí",
};

const dotColors: Record<RegimeSignal, string> = {
  bullish: "bg-emerald-400",
  neutral: "bg-amber-400",
  bearish: "bg-rose-500",
};

const signalStyles: Record<
  RegimeSignal,
  { ring: string; bg: string; text: string; glow: string }
> = {
  bullish: {
    ring: "ring-emerald-400/40",
    bg: "bg-emerald-400/10",
    text: "text-emerald-400",
    glow: "shadow-[0_0_16px_rgba(52,211,153,0.2)]",
  },
  neutral: {
    ring: "ring-amber-400/40",
    bg: "bg-amber-400/10",
    text: "text-amber-400",
    glow: "shadow-[0_0_16px_rgba(251,191,36,0.15)]",
  },
  bearish: {
    ring: "ring-rose-500/40",
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    glow: "shadow-[0_0_16px_rgba(244,63,94,0.2)]",
  },
};

const toneBanner: Record<RegimeSignal, string> = {
  bullish: "border-emerald-400/20 bg-emerald-400/8 text-emerald-300",
  neutral: "border-amber-400/20 bg-amber-400/8 text-amber-300",
  bearish: "border-rose-500/20 bg-rose-500/8 text-rose-300",
};

function FactorOrb({
  factor,
  index,
}: {
  factor: RegimeFactor;
  index: number;
}) {
  const styles = signalStyles[factor.signal];
  const displayLabel =
    factor.id === "fng" ? `${factor.label} (${factor.value})` : factor.label;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay: 0.08 + index * 0.05 }}
      className="flex min-w-0 flex-col items-center gap-2"
    >
      <div
        className={`relative flex h-14 w-14 items-center justify-center rounded-full ring-2 sm:h-16 sm:w-16 ${styles.ring} ${styles.bg} ${styles.glow}`}
        role="img"
        aria-label={`${displayLabel}: skóre ${factor.score}, signál ${signalCopy[factor.signal]}${
          factor.id === "fng" ? "" : `, ${factor.value}`
        }`}
      >
        <span className={`text-base font-black sm:text-lg ${styles.text}`}>
          {factor.score}
        </span>
        <span
          className={`absolute -bottom-0.5 h-2 w-2 rounded-full ${dotColors[factor.signal]}`}
          aria-hidden="true"
        />
      </div>
      <p className="text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-zinc-400">
        {displayLabel}
      </p>
      {factor.id !== "fng" && (
        <p className={`text-[9px] font-semibold uppercase ${styles.text}`}>
          {factor.value}
        </p>
      )}
    </motion.div>
  );
}

export function MarketRegimeFactors() {
  const summary = summarizeMarketRegime();

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Master Dynamic Allocation
        </p>
        <h3 className="mt-1 text-sm font-bold text-white">
          5 faktorov trhového režimu
        </h3>
      </div>

      <div
        className={`mb-5 rounded-2xl border px-3.5 py-3 ${toneBanner[summary.tone]}`}
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Režim
            </p>
            <p className="text-sm font-bold text-white">{summary.label}</p>
          </div>
          <p className="text-right text-xs font-semibold text-white">
            {summary.averageScore}
            <span className="text-zinc-500">/100</span>
          </p>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
          {summary.description}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-5">
        {MARKET_REGIME_FACTORS.map((factor, index) => (
          <div key={factor.id} className="w-[30%] min-w-[88px] max-w-[112px]">
            <FactorOrb factor={factor} index={index} />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Býčí
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Neutrálny
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Medvedí
        </span>
      </div>
    </motion.section>
  );
}
