"use client";

import { motion } from "framer-motion";
import { Anchor, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ExchangeBalanceModal } from "@/components/dca/ExchangeBalanceModal";
import { QUICK_AMOUNTS } from "@/lib/dcaEngineConfig";
import { ALL_DCA_TOKENS } from "@/lib/dcaMarketData";
import type { ExchangeBalanceResponse } from "@/lib/exchange/types";
import { formatUsd } from "@/lib/data";
import { interactiveButton } from "@/lib/motion";
import type { TradingMode } from "@/lib/exchange/types";

interface WeeklyInvestmentCardProps {
  value: number;
  onChange: (value: number) => void;
  tradingMode: TradingMode;
}

export function WeeklyInvestmentCard({
  value,
  onChange,
  tradingMode,
}: WeeklyInvestmentCardProps) {
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [freeBalanceUsd, setFreeBalanceUsd] = useState(0);

  const handleFetchBalance = async () => {
    if (tradingMode !== "live") {
      setBalanceError("Načítanie zostatku je dostupné len v režime Live Trading.");
      return;
    }

    setBalanceLoading(true);
    setBalanceError(null);

    try {
      const response = await fetch("/api/exchange/balance", { cache: "no-store" });
      const json = (await response.json()) as ExchangeBalanceResponse;

      if (!json.success || json.freeBalanceUsd == null) {
        throw new Error(json.error ?? "Nepodarilo sa načítať zostatok z burzy");
      }

      setFreeBalanceUsd(json.freeBalanceUsd);
      setBalanceModalOpen(true);
    } catch (error) {
      setBalanceError(
        error instanceof Error ? error.message : "Nepodarilo sa načítať zostatok",
      );
    } finally {
      setBalanceLoading(false);
    }
  };

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-5"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                Weekly Investment
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Týždenná suma na DCA (USD)
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                tradingMode === "live"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {tradingMode === "live" ? "Live" : "Sim"}
            </span>
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

          <button
            type="button"
            onClick={() => void handleFetchBalance()}
            disabled={balanceLoading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-zinc-300 transition-all duration-300 hover:border-emerald-400/25 hover:text-emerald-300 disabled:opacity-50"
          >
            {balanceLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Načítať zostatok z burzy
          </button>

          {balanceError && (
            <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-400/90">
              {balanceError}
            </p>
          )}

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
              {ALL_DCA_TOKENS.filter((t) => t.category !== "yield")
                .map((t) => `${t.symbol} ${t.weightPercent}%`)
                .join(" · ")}
            </span>
          </div>
        </div>
      </motion.section>

      <ExchangeBalanceModal
        open={balanceModalOpen}
        freeBalanceUsd={freeBalanceUsd}
        onClose={() => setBalanceModalOpen(false)}
        onConfirm={onChange}
      />
    </>
  );
}
