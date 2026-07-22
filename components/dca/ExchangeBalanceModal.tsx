"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { formatUsd } from "@/lib/data";

interface ExchangeBalanceModalProps {
  open: boolean;
  freeBalanceUsd: number;
  onClose: () => void;
  onConfirm: (weeklyBudget: number) => void;
}

export function ExchangeBalanceModal({
  open,
  freeBalanceUsd,
  onClose,
  onConfirm,
}: ExchangeBalanceModalProps) {
  const defaultPct = 25;

  const handleConfirm = (pct: number) => {
    const weeklyBudget = Math.round(((freeBalanceUsd * pct) / 100) * 100) / 100;
    onConfirm(weeklyBudget);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111113] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Live Wallet Balance
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">
                  Našli sme {formatUsd(freeBalanceUsd)} voľného kapitálu
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Aké % chceš tento týždeň alokovať do DCA?
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 p-2 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[10, 25, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleConfirm(pct)}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-all duration-300 hover:border-emerald-400/30 hover:bg-emerald-400/5"
                >
                  <p className="text-sm font-bold text-white">{pct}%</p>
                  <p className="text-[11px] text-emerald-400">
                    {formatUsd((freeBalanceUsd * pct) / 100)}
                  </p>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleConfirm(defaultPct)}
              className="mt-4 w-full rounded-2xl border border-emerald-400/30 bg-emerald-400/10 py-3 text-sm font-bold text-emerald-400 transition-all duration-300 hover:bg-emerald-400/15"
            >
              Použiť {defaultPct}% ({formatUsd((freeBalanceUsd * defaultPct) / 100)})
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
