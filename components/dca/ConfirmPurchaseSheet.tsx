"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { formatUsd } from "@/lib/data";
import {
  estimateTokenQty,
  formatEstimatedQty,
  type TokenExecutionPlan,
} from "@/lib/dcaEngineConfig";
import type { CryptoPricesMap } from "@/lib/cryptoApi";
import { tokenAccentStyles } from "@/lib/dcaData";
import { interactiveButton } from "@/lib/motion";

interface ConfirmPurchaseSheetProps {
  open: boolean;
  plans: TokenExecutionPlan[];
  prices?: CryptoPricesMap;
  totalUsd: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmPurchaseSheet({
  open,
  plans,
  prices,
  totalUsd,
  onClose,
  onConfirm,
}: ConfirmPurchaseSheetProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Zavrieť"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dca-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 mx-4 mb-[max(1rem,env(safe-area-inset-bottom))] w-full max-w-lg rounded-3xl border border-white/10 bg-[#111113] p-5 shadow-2xl sm:mb-0"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                  DCA nákup
                </p>
                <h2
                  id="confirm-dca-title"
                  className="mt-1 text-lg font-bold text-white"
                >
                  Potvrdiť záznam
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 p-2 text-zinc-400 hover:text-white"
                aria-label="Zavrieť"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              Záznam pripočíta celú týždennú sumu do portfólia za aktuálne live
              ceny. MKT / LMT split je plán vykonania na burze, nie samostatné
              transakcie.
            </p>

            <ul className="space-y-2.5">
              {plans
                .filter((plan) => plan.totalUsd > 0)
                .map((plan) => {
                  const styles = tokenAccentStyles[plan.accent];
                  const unitPrice = prices?.[plan.symbol]?.price ?? 0;
                  const qty = estimateTokenQty(plan.totalUsd, unitPrice);

                  return (
                    <li
                      key={plan.symbol}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ${styles.icon}`}
                          aria-hidden="true"
                        >
                          {plan.symbol.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {plan.symbol}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            MKT {formatUsd(plan.marketUsd)} · LMT{" "}
                            {formatUsd(plan.limitUsd)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">
                          {formatUsd(plan.totalUsd)}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {formatEstimatedQty(qty, plan.symbol)}
                        </p>
                      </div>
                    </li>
                  );
                })}
            </ul>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Spolu
              </p>
              <p className="text-lg font-bold text-emerald-400">
                {formatUsd(totalUsd)}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <motion.button
                type="button"
                onClick={onClose}
                {...interactiveButton}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-zinc-300 hover:text-white"
              >
                Zrušiť
              </motion.button>
              <motion.button
                type="button"
                onClick={onConfirm}
                {...interactiveButton}
                className="rounded-2xl border border-emerald-400/30 bg-emerald-400/15 px-4 py-3 text-sm font-bold text-emerald-400"
              >
                Potvrdiť a uložiť
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
