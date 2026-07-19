"use client";

import { motion } from "framer-motion";
import { MaskedValue } from "@/components/MaskedValue";
import { formatUsd } from "@/lib/data";
import type { Transaction } from "@/lib/portfolioStorage";
import {
  listContainerVariants,
  listItemVariants,
} from "@/lib/motion";
import { MASK_CRYPTO, MASK_USD } from "@/lib/privacyStorage";

const accentStyles = {
  BTC: {
    ring: "ring-orange-500/30",
    bg: "bg-orange-500",
  },
  ETH: {
    ring: "ring-purple-400/30",
    bg: "bg-purple-500",
  },
  SOL: {
    ring: "ring-cyan-400/30",
    bg: "bg-gradient-to-br from-cyan-400 to-blue-500",
  },
} as const;

function formatTransactionDate(date: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatAmount(amount: number, symbol: string) {
  const decimals = symbol === "BTC" ? 6 : symbol === "ETH" ? 5 : 4;
  return `+${amount.toFixed(decimals)} ${symbol}`;
}

interface TransactionHistoryProps {
  transactions: Transaction[];
}

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          História transakcií
        </h2>
        <span className="text-xs text-zinc-600">{transactions.length} záznamov</span>
      </div>

      {transactions.length === 0 ? (
        <div className="rounded-3xl border border-white/5 bg-[#111113] px-4 py-8 text-center">
          <p className="text-sm font-medium text-zinc-400">Zatiaľ žiadne nákupy</p>
          <p className="mt-1 text-xs text-zinc-600">
            Zaznamenaj prvý DCA nákup v záložke DCA Engine.
          </p>
        </div>
      ) : (
        <motion.div
          variants={listContainerVariants}
          initial="hidden"
          animate="show"
          className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113]"
        >
          {transactions.map((transaction, index) => {
            const styles = accentStyles[transaction.symbol];

            return (
              <motion.div
                key={transaction.id}
                variants={listItemVariants}
                className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 ${
                  index < transactions.length - 1
                    ? "border-b border-zinc-800/50"
                    : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 ${styles.ring} ${styles.bg}`}
                  >
                    <span className="text-[10px] font-bold text-white">
                      {transaction.symbol.slice(0, 1)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      Nákup (DCA)
                    </p>
                    <p className="text-xs text-zinc-500">{transaction.symbol}</p>
                  </div>
                </div>

                <p className="text-center text-[11px] leading-snug text-zinc-500">
                  {formatTransactionDate(transaction.date)}
                </p>

                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-400">
                    <MaskedValue masked={MASK_CRYPTO}>
                      {formatAmount(transaction.amount, transaction.symbol)}
                    </MaskedValue>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    <MaskedValue masked={MASK_USD}>
                      {formatUsd(transaction.spentUsd)}
                    </MaskedValue>
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.section>
  );
}
