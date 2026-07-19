"use client";

import { motion } from "framer-motion";
import { formatUsd } from "@/lib/data";
import {
  formatYieldBalance,
  yieldTokens,
} from "@/lib/yieldTokensData";

export function YieldTokensList() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      className="space-y-3"
    >
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Yield Tokeny
      </h2>

      <div className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113]">
        {yieldTokens.map((token, index) => {
          const isPositive = token.change7dUsd >= 0;

          return (
            <motion.div
              key={token.symbol}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.18 + index * 0.05 }}
              className={`flex items-center gap-4 px-4 py-4 ${
                index < yieldTokens.length - 1
                  ? "border-b border-zinc-800/50"
                  : ""
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-2 ${token.ring} ${token.accent}`}
              >
                <span className="text-xs font-bold text-white">
                  {token.symbol.slice(0, 1)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-white">{token.symbol}</p>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400">
                    EARNING
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {formatYieldBalance(token.balance, token.symbol)}
                </p>
              </div>

              <div className="text-right">
                <p className="font-semibold text-white">
                  {formatUsd(token.usdValue)}
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    isPositive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {formatUsd(token.change7dUsd)}{" "}
                  {isPositive ? "+" : ""}
                  {token.change7dPercent.toFixed(1)}%
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
