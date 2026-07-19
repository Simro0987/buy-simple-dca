"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ASSET_DEFINITIONS,
  type HoldingsMap,
} from "@/lib/portfolioStorage";

interface EditHoldingsModalProps {
  open: boolean;
  holdings: HoldingsMap;
  onClose: () => void;
  onSave: (holdings: HoldingsMap) => void;
}

const accentRing: Record<string, string> = {
  orange: "focus:ring-orange-500/50 focus:border-orange-500/40",
  purple: "focus:ring-purple-500/50 focus:border-purple-500/40",
  cyan: "focus:ring-cyan-400/50 focus:border-cyan-400/40",
};

export function EditHoldingsModal({
  open,
  holdings,
  onClose,
  onSave,
}: EditHoldingsModalProps) {
  const [draft, setDraft] = useState<HoldingsMap>(holdings);

  useEffect(() => {
    if (open) {
      setDraft(holdings);
    }
  }, [open, holdings]);

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

  const handleSave = () => {
    onSave({
      BTC: Math.max(0, Number(draft.BTC) || 0),
      ETH: Math.max(0, Number(draft.ETH) || 0),
      SOL: Math.max(0, Number(draft.SOL) || 0),
    });
    onClose();
  };

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
            aria-labelledby="edit-holdings-title"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full max-w-lg rounded-t-3xl border border-white/10 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-xl sm:rounded-3xl sm:m-4"
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    Portfólio
                  </p>
                  <h2
                    id="edit-holdings-title"
                    className="mt-1 text-xl font-bold text-white"
                  >
                    Upraviť zostatky
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Zadaj množstvá, ktoré aktuálne vlastníš.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {ASSET_DEFINITIONS.map((asset) => (
                  <label
                    key={asset.symbol}
                    className="block rounded-2xl border border-white/5 bg-[#111113] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {asset.symbol}
                        </p>
                        <p className="text-xs text-zinc-500">{asset.name}</p>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={draft[asset.symbol]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [asset.symbol]: Number(event.target.value),
                        }))
                      }
                      className={`w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-zinc-600 focus:ring-2 ${accentRing[asset.accent]}`}
                      placeholder="0.00"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
                >
                  Zrušiť
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)] transition hover:bg-emerald-400/20"
                >
                  Uložiť zostatky
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
