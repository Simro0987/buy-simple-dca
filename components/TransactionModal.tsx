"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LiveAsset, RecordTransactionInput } from "@/hooks/usePortfolio";

interface TransactionModalProps {
  open: boolean;
  asset: LiveAsset | null;
  onClose: () => void;
  onSubmit: (input: RecordTransactionInput) => boolean;
}

type Tab = "ADD" | "REMOVE";

export function TransactionModal({
  open,
  asset,
  onClose,
  onSubmit,
}: TransactionModalProps) {
  const [tab, setTab] = useState<Tab>("ADD");
  const [amount, setAmount] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !asset) return;

    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    setTab("ADD");
    setAmount("");
    setPriceUsd(asset.unitPrice > 0 ? String(asset.unitPrice) : "");
    setDate(local);
    setError(null);
  }, [asset, open]);

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

  const handleSubmit = () => {
    if (!asset) return;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Zadaj platné množstvo.");
      return;
    }

    if (tab === "REMOVE" && parsedAmount > asset.balance) {
      setError("Nemôžeš odstrániť viac, než je aktuálny zostatok.");
      return;
    }

    const parsedPrice = priceUsd ? Number(priceUsd) : undefined;
    const isoDate = date
      ? new Date(date).toISOString()
      : new Date().toISOString();

    const success = onSubmit({
      assetId: asset.id,
      type: tab,
      amount: parsedAmount,
      priceUsd: parsedPrice,
      date: isoDate,
    });

    if (success) {
      onClose();
      return;
    }

    setError("Transakciu sa nepodarilo uložiť.");
  };

  return (
    <AnimatePresence>
      {open && asset && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Zavrieť"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-modal-title"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative z-10 w-full max-w-lg rounded-t-3xl border border-white/10 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-xl sm:rounded-3xl sm:m-4"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {asset.symbol}
                </p>
                <h2
                  id="transaction-modal-title"
                  className="mt-1 text-xl font-bold text-white"
                >
                  Transakcia
                </h2>
                <p className="mt-1 text-sm text-zinc-500">{asset.name}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/5 bg-[#111113] p-1">
              {(["ADD", "REMOVE"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    tab === value
                      ? value === "ADD"
                        ? "bg-emerald-400/15 text-emerald-400"
                        : "bg-rose-400/15 text-rose-400"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {value === "ADD" ? "Pridať" : "Odstrániť"}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  Množstvo ({asset.symbol})
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  placeholder="0.00"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  Cena za jednotku (voliteľné)
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={priceUsd}
                  onChange={(event) => setPriceUsd(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                  placeholder="USD"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-500">
                  Dátum
                </span>
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                />
              </label>
            </div>

            {error && (
              <p className="mt-4 text-sm text-rose-400">{error}</p>
            )}

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
                onClick={handleSubmit}
                className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  tab === "ADD"
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20"
                    : "border-rose-400/30 bg-rose-400/10 text-rose-400 hover:bg-rose-400/20"
                }`}
              >
                {tab === "ADD" ? "Pridať transakciu" : "Odstrániť transakciu"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
