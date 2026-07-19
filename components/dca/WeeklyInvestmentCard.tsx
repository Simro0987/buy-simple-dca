"use client";

import { motion } from "framer-motion";
import { Anchor } from "lucide-react";
import {
  ANCHOR_SPLIT,
  QUICK_AMOUNTS,
} from "@/lib/dcaEngineConfig";
import { formatUsd } from "@/lib/data";
import { interactiveButton } from "@/lib/motion";

interface WeeklyInvestmentCardProps {
  value: number;
  onChange: (value: number) => void;
}

export function WeeklyInvestmentCard({
  value,
  onChange,
}: WeeklyInvestmentCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Weekly Investment
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Týždenná suma na DCA (USD)
          </p>
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-zinc-500">
            $
          </span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={value || ""}
            onChange={(event) =>
              onChange(Math.max(0, Number(event.target.value) || 0))
            }
            className="w-full rounded-2xl border border-white/10 bg-black/50 py-4 pl-10 pr-4 text-3xl font-bold tracking-tight text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <motion.button
              key={amount}
              type="button"
              onClick={() => onChange(amount)}
              {...interactiveButton}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                value === amount
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              }`}
            >
              {formatUsd(amount)}
            </motion.button>
          ))}
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
          <Anchor className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Anchor Split
          </span>
          <span className="text-[11px] font-bold text-white">
            BTC {ANCHOR_SPLIT.BTC}% · ETH {ANCHOR_SPLIT.ETH}% · SOL{" "}
            {ANCHOR_SPLIT.SOL}%
          </span>
        </div>
      </div>
    </motion.section>
  );
}
