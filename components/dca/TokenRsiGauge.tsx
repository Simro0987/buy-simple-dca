"use client";

import { motion } from "framer-motion";
import { formatDecimal } from "@/lib/numberFormat";
import { describeRsiZone } from "@/lib/rsiInterpolation";

interface TokenRsiGaugeProps {
  rsi: number | null;
  symbol?: string;
  loading?: boolean;
}

export function TokenRsiGauge({
  rsi,
  symbol,
  loading = false,
}: TokenRsiGaugeProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
        <div className="h-3 animate-pulse rounded-full bg-zinc-800" />
      </div>
    );
  }

  if (rsi == null) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5">
        <p className="text-[10px] text-zinc-500">
          RSI teplomer — čakáme na live dáta{symbol ? ` (${symbol})` : ""}…
        </p>
      </div>
    );
  }

  const clamped = Math.min(100, Math.max(0, rsi));
  const positionPct = clamped;
  const zone = describeRsiZone(clamped);

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          RSI Teplomer
        </p>
        <p className="text-[10px] font-semibold tabular-nums text-zinc-300">
          <span className="text-white">{formatDecimal(clamped, 1)}</span>
          <span className="mx-1 text-zinc-600">·</span>
          <span className="text-zinc-400">{zone}</span>
        </p>
      </div>

      <div className="relative h-2.5 overflow-visible rounded-full">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(to right, rgb(56 189 248) 0%, rgb(52 211 153) 18%, rgb(113 113 122) 50%, rgb(251 191 36) 72%, rgb(244 63 94) 100%)",
          }}
          aria-hidden
        />
        <div className="absolute inset-0 rounded-full bg-black/20" aria-hidden />

        <motion.div
          className="absolute top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900 shadow-[0_0_10px_rgba(255,255,255,0.35)]"
          initial={false}
          animate={{ left: `${positionPct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          style={{ marginLeft: "-7px" }}
          title={`RSI ${formatDecimal(clamped, 1)}`}
          aria-label={`RSI ${formatDecimal(clamped, 1)}`}
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[8px] font-medium uppercase tracking-wide text-zinc-600">
        <span>0 Prep.</span>
        <span>50</span>
        <span>100 Prek.</span>
      </div>
    </div>
  );
}
