"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { glassPanel } from "@/lib/dca/glass";
import type { TokenExecutionPlan } from "@/lib/dca/types";
import { formatUsd } from "@/lib/data";

interface RitualSheetProps {
  open: boolean;
  plans: TokenExecutionPlan[];
  activations: Partial<Record<string, { market: boolean; limit: boolean }>>;
  onClose: () => void;
}

export function RitualSheet({
  open,
  plans,
  activations,
  onClose,
}: RitualSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const activePlans = plans.filter((plan) => plan.totalUsd > 0);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Zavrieť"
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ritual-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className={`relative z-10 mx-4 mb-[max(1rem,env(safe-area-inset-bottom))] max-h-[80vh] w-full max-w-lg overflow-y-auto ${glassPanel} p-5 sm:mb-0`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Týždenný rituál
                </p>
                <h2 id="ritual-title" className="text-lg font-bold text-white">
                  Checklist nákupu
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 p-2 text-zinc-400"
                aria-label="Zavrieť"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              Aktivuj MKT / LMT na karte tokenu, zadaj príkazy na burze a až potom
              ulož záznam do portfólia. Aplikácia príkazy na burze neodosiela.
            </p>
            <ul className="space-y-2">
              {activePlans.map((plan) => {
                const state = activations[plan.symbol];
                return (
                  <li
                    key={plan.symbol}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{plan.symbol}</p>
                      <p className="text-xs text-zinc-400">{formatUsd(plan.totalUsd)}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Market {state?.market ? "hotovo" : "čaká"} · Limit{" "}
                      {state?.limit ? "hotovo" : "čaká"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
