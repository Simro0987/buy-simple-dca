"use client";

import { motion } from "framer-motion";
import { CalendarCheck, History, Timer } from "lucide-react";
import { formatUsd } from "@/lib/data";
import { formatCountdown, type PendingOrder } from "@/lib/dca/executionLedger";
import { isInCurrentDcaWeek } from "@/lib/dcaEngineConfig";
import type { Transaction } from "@/lib/portfolioStorage";

interface DcaActivityCardProps {
  transactions: Transaction[];
  pendingOrders?: PendingOrder[];
  nowMs?: number;
}

function formatTransactionDate(date: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function DcaActivityCard({
  transactions,
  pendingOrders = [],
  nowMs = Date.now(),
}: DcaActivityCardProps) {
  const lastPurchase = transactions[0];
  const recordedThisWeek = lastPurchase
    ? isInCurrentDcaWeek(lastPurchase.date)
    : false;
  const weekSpend = transactions
    .filter((tx) => isInCurrentDcaWeek(tx.date))
    .reduce((sum, tx) => sum + tx.spentUsd, 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Aktivita
          </p>
          <h3 className="mt-1 text-sm font-bold text-white">Posledné nákupy</h3>
        </div>
        <span className="text-xs text-zinc-500">
          {transactions.length === 0
            ? "žiadne záznamy"
            : `${transactions.length} záznamov`}
        </span>
      </div>

      <div
        className={`mb-4 flex items-start gap-3 rounded-2xl border px-3.5 py-3 ${
          recordedThisWeek
            ? "border-emerald-400/20 bg-emerald-400/8"
            : "border-white/5 bg-white/[0.02]"
        }`}
      >
        <CalendarCheck
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            recordedThisWeek ? "text-emerald-400" : "text-zinc-500"
          }`}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-white">
            {recordedThisWeek
              ? "Tento týždeň už máš záznam"
              : "Tento týždeň ešte nie je záznam"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {recordedThisWeek
              ? `Zaznamenané ${formatUsd(weekSpend)}. Ďalší nákup podľa plánu budúci týždeň.`
              : "Po nákupe na burze ho tu ulož, aby sedelo portfólio."}
          </p>
        </div>
      </div>

      {pendingOrders.length > 0 && (
        <ul className="mb-4 space-y-2">
          {pendingOrders.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 shadow-[0_0_18px_rgba(251,191,36,0.18)]"
            >
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-100">
                  <Timer className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
                  {order.symbol} · Čakajúca
                </p>
                <p className="text-[11px] text-amber-100/80">
                  {formatCountdown(order.expiresAt, nowMs)}
                </p>
              </div>
              <p className="text-sm font-bold text-amber-200">
                {formatUsd(order.spentUsd)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {transactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center">
          <History className="mx-auto h-5 w-5 text-zinc-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-zinc-400">
            Zatiaľ žiadne nákupy
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Prvý záznam sa objaví tu aj v histórii v záložke Portfolio.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {transactions.slice(0, 3).map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{tx.symbol}</p>
                <p className="text-[11px] text-zinc-500">
                  {formatTransactionDate(tx.date)}
                </p>
              </div>
              <p className="text-sm font-bold text-emerald-400">
                {formatUsd(tx.spentUsd)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
