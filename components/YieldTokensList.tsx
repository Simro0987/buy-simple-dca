"use client";

import { motion } from "framer-motion";
import { MaskedValue } from "@/components/MaskedValue";
import { formatUsd } from "@/lib/data";
import {
  formatYieldBalance,
  yieldTokens,
} from "@/lib/yieldTokensData";
import {
  interactiveRow,
  listContainerVariants,
  listItemVariants,
} from "@/lib/motion";
import {
  MASK_CRYPTO,
  MASK_PNL,
  MASK_USD,
} from "@/lib/privacyStorage";

export function YieldTokensList() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Yield Tokeny
      </h2>

      <motion.div
        variants={listContainerVariants}
        initial="hidden"
        animate="show"
        className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113]"
      >
        {yieldTokens.map((token, index) => {
          const hasHistory = token.balance > 0 && token.totalSpent > 0;
          const isPositive = token.pnlUsd >= 0;
          const pnlLabel = hasHistory
            ? `${isPositive ? "+" : "-"}${formatUsd(Math.abs(token.pnlUsd))} ${isPositive ? "+" : "-"}${Math.abs(token.roiPercent).toFixed(1)}%`
            : "+$0.00 +0.0%";

          return (
            <motion.div
              key={token.symbol}
              variants={listItemVariants}
              {...interactiveRow}
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
                  <MaskedValue masked={MASK_CRYPTO}>
                    {formatYieldBalance(token.balance, token.symbol)}
                  </MaskedValue>
                </p>
              </div>

              <div className="text-right">
                <p className="font-semibold text-white">
                  <MaskedValue masked={MASK_USD}>
                    {formatUsd(token.usdValue)}
                  </MaskedValue>
                </p>
                <MaskedValue
                  masked={MASK_PNL}
                  className={`mt-1 inline-block text-xs font-medium ${
                    hasHistory
                      ? isPositive
                        ? "text-emerald-400"
                        : "text-rose-400"
                      : "text-zinc-600"
                  }`}
                >
                  {pnlLabel}
                </MaskedValue>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.section>
  );
}
