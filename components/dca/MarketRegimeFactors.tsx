"use client";

import { motion } from "framer-motion";
import {
  MARKET_REGIME_FACTORS,
  type RegimeFactor,
  type RegimeSignal,
} from "@/lib/dcaEngineConfig";

const dotColors: Record<RegimeSignal, string> = {
  bullish: "bg-emerald-400",
  neutral: "bg-orange-400",
  bearish: "bg-orange-500",
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
    ring: "ring-orange-400/40",
    bg: "bg-orange-400/10",
    text: "text-orange-400",
    glow: "shadow-[0_0_16px_rgba(251,146,60,0.15)]",
  },
  bearish: {
    ring: "ring-orange-500/40",
    bg: "bg-orange-500/10",
    text: "text-orange-500",
    glow: "shadow-[0_0_16px_rgba(249,115,22,0.2)]",
  },
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
      className="flex min-w-[88px] flex-1 flex-col items-center gap-2"
    >
      <div
        className={`relative flex h-16 w-16 items-center justify-center rounded-full ring-2 ${styles.ring} ${styles.bg} ${styles.glow}`}
      >
        <span className={`text-lg font-black ${styles.text}`}>
          {factor.score}
        </span>
        <span
          className={`absolute -bottom-0.5 h-2 w-2 rounded-full ${dotColors[factor.signal]}`}
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
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Master Dynamic Allocation
        </p>
        <h3 className="mt-1 text-sm font-bold text-white">
          5 Faktorov trhového režimu
        </h3>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {MARKET_REGIME_FACTORS.map((factor, index) => (
          <FactorOrb key={factor.id} factor={factor} index={index} />
        ))}
      </div>
    </motion.section>
  );
}
