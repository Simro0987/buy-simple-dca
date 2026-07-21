"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Clock, Sparkles } from "lucide-react";
import type { MondayTimingEvaluation } from "@/lib/smartMondayTiming";

interface SmartMondayTimingBannerProps {
  timing: MondayTimingEvaluation | null;
  loading?: boolean;
}

export function SmartMondayTimingBanner({
  timing,
  loading = false,
}: SmartMondayTimingBannerProps) {
  if (loading && !timing) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[11px] text-zinc-500">
        Smart Monday Timing Engine sa načítava...
      </div>
    );
  }

  if (!timing) return null;

  const isReady = timing.status === "ready";
  const isWaiting = timing.status === "waiting";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={timing.message}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className={`rounded-2xl border px-4 py-3 transition-all duration-500 ease-in-out ${
          isReady
            ? "border-emerald-500/25 bg-emerald-500/10"
            : isWaiting
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-white/5 bg-white/[0.02]"
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              isReady
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            }`}
          >
            {isReady ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Smart Monday Timing Engine
            </p>
            <p
              className={`mt-1 text-sm font-semibold leading-snug transition-colors duration-500 ease-in-out ${
                isReady ? "text-emerald-300" : isWaiting ? "text-amber-300" : "text-zinc-300"
              }`}
            >
              {timing.message}
            </p>
            {timing.isMonday && (
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                BTC 1h {timing.indicators.btcChange1hPct >= 0 ? "+" : ""}
                {timing.indicators.btcChange1hPct}% • 4h{" "}
                {timing.indicators.btcChange4hPct >= 0 ? "+" : ""}
                {timing.indicators.btcChange4hPct}% • RSI BTC{" "}
                {timing.indicators.btcRsi14} / ETH {timing.indicators.ethRsi14}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
