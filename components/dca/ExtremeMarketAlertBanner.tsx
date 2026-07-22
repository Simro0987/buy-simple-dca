"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame, Zap } from "lucide-react";
import {
  EXTREME_MARKET_ALERT_COPY,
  resolveExtremeMarketAlert,
} from "@/lib/dcaExtremeMarketAlert";
import { formatDecimal } from "@/lib/numberFormat";

interface ExtremeMarketAlertBannerProps {
  finalScore: number;
  fearGreed: number;
}

const bannerMotion = {
  initial: { opacity: 0, height: 0, y: -6 },
  animate: { opacity: 1, height: "auto", y: 0 },
  exit: { opacity: 0, height: 0, y: -4 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
};

export function ExtremeMarketAlertBanner({
  finalScore,
  fearGreed,
}: ExtremeMarketAlertBannerProps) {
  const alertKind = resolveExtremeMarketAlert(finalScore, fearGreed);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {alertKind && (
        <motion.div
          key={alertKind}
          layout
          {...bannerMotion}
          className="overflow-hidden"
        >
          <div
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors duration-500 ease-in-out ${
              alertKind === "panic"
                ? "border-rose-500/25 bg-rose-500/[0.06]"
                : "border-amber-500/25 bg-amber-500/[0.06]"
            }`}
          >
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                alertKind === "panic"
                  ? "bg-rose-500/15 text-rose-400"
                  : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {alertKind === "panic" ? (
                <Zap className="h-3.5 w-3.5 animate-pulse" />
              ) : (
                <Flame className="h-3.5 w-3.5 animate-pulse" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-semibold leading-relaxed transition-colors duration-500 ease-in-out ${
                  alertKind === "panic" ? "text-rose-300" : "text-amber-300"
                }`}
              >
                {EXTREME_MARKET_ALERT_COPY[alertKind]}
              </p>
              <p className="mt-1.5 text-[10px] tabular-nums text-zinc-600 transition-all duration-500 ease-in-out">
                Final Score {formatDecimal(finalScore, 1)} • Fear & Greed{" "}
                {Math.round(fearGreed)}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
