"use client";

import { motion } from "framer-motion";
import { formatUsd } from "@/lib/data";
import type { Transaction } from "@/lib/portfolioStorage";
import {
  listContainerVariants,
  listItemVariants,
} from "@/lib/motion";

const TYPE_LABELS: Record<Transaction["type"], string> = {
  DCA: "DCA",
  ADD: "Pridať",
  REMOVE: "Odstrániť",
};

function formatTransactionDate(date: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatAmount(transaction: Transaction) {
  const decimals =
    transaction.symbol === "BTC" ? 6 : transaction.symbol === "ETH" ? 5 : 4;
  const prefix = transaction.type === "REMOVE" ? "-" : "+";
  return `${prefix}${transaction.amount.toFixed(decimals)} ${transaction.symbol}`;
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
          <p className="text-sm font-medium text-zinc-400">Zatiaľ žiadne transakcie</p>
          <p className="mt-1 text-xs text-zinc-600">
            Pridaj token alebo zaznamenaj DCA nákup.
          </p>
        </div>
      ) : (
        <motion.div
          variants={listContainerVariants}
          initial="hidden"
          animate="show"
          className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113]"
        >
          {transactions.map((transaction, index) => (
            <motion.div
              key={transaction.id}
              variants={listItemVariants}
              className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 ${
                index < transactions.length - 1
                  ? "border-b border-zinc-800/50"
                  : ""
              }`}
            >
              <div className="min-w-0">
                <p
                  className={`truncate text-sm font-semibold ${
                    transaction.type === "REMOVE"
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}
                >
                  {TYPE_LABELS[transaction.type]}
                </p>
                <p className="text-xs text-zinc-500">{transaction.symbol}</p>
              </div>

              <p className="text-center text-[11px] leading-snug text-zinc-500">
                {formatTransactionDate(transaction.date)}
              </p>

              <div className="text-right">
                <p className="text-sm font-bold text-white">
                  {formatAmount(transaction)}
                </p>
                {transaction.spentUsd > 0 && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatUsd(transaction.spentUsd)}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.section>
  );
}
