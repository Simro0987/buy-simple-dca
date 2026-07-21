"use client";

import { motion } from "framer-motion";
import { formatUsd, formatUnitPrice } from "@/lib/data";
import type { DcaTradeRound } from "@/lib/exchange/types";
import { readTradeHistory, TRADE_HISTORY_UPDATED_EVENT } from "@/lib/tradeHistory";
import { useEffect, useState } from "react";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("sk-SK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TradeHistoryPanel() {
  const [rounds, setRounds] = useState<DcaTradeRound[]>([]);

  useEffect(() => {
    const refresh = () => setRounds(readTradeHistory());
    refresh();
    window.addEventListener(TRADE_HISTORY_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(TRADE_HISTORY_UPDATED_EVENT, refresh);
  }, []);

  if (rounds.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
          DCA Trade History
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Zatiaľ žiadne Deploy All kolo. Po úspešnom deployi sa tu uloží kompletný
          záznam nákupu.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
          DCA Trade History
        </p>
        <h3 className="mt-1 text-sm font-bold text-white">
          Pamäť nákupov · {rounds.length} kôl
        </h3>
      </div>

      <div className="space-y-3">
        {rounds.map((round) => (
          <motion.article
            key={round.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-white">
                  {formatDate(round.executedAt)}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  {round.mode === "live" ? "Live Trading" : "Simulácia"} •{" "}
                  {round.regimeLabel} • Score {Math.round(round.finalScore)}
                </p>
              </div>
              <p className="text-sm font-bold text-emerald-400">
                {formatUsd(round.totalInvestedUsd)}
              </p>
            </div>

            <div className="mt-3 space-y-1.5">
              {round.orders.map((order, index) => (
                <div
                  key={`${round.id}-${order.symbol}-${order.leg}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-[11px]"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-white">{order.symbol}</span>
                    <span className="ml-2 uppercase text-zinc-500">
                      {order.leg}
                    </span>
                    <span className="ml-2 text-zinc-600">{order.category}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-zinc-300">
                      {formatUsd(order.amountUsd)}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      @ {formatUnitPrice(order.price)} •{" "}
                      {order.status === "simulated"
                        ? "sim"
                        : order.status === "open"
                          ? "limit open"
                          : order.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
