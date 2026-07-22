"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, FileJson, History, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DCA_JOURNAL_UPDATED_EVENT,
  downloadDcaJournalCsv,
  downloadDcaJournalJson,
  readDcaJournal,
  type DcaJournalEntry,
} from "@/lib/dcaJournal";
import { formatCopyAmount2, formatCopyLimitPrice4 } from "@/lib/executionFormatting";
import { formatRsi, formatUnitPrice, formatUsd } from "@/lib/numberFormat";

interface DcaJournalModalProps {
  open: boolean;
  onClose: () => void;
}

function formatRecordedAt(iso: string): string {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function triggerLabel(trigger: DcaJournalEntry["trigger"]): string {
  return trigger === "activate_limit" ? "Aktivácia limitu" : "Kópia LMT ceny";
}

export function DcaJournalModal({ open, onClose }: DcaJournalModalProps) {
  const [entries, setEntries] = useState<DcaJournalEntry[]>([]);

  useEffect(() => {
    if (!open) return;

    const refresh = () => setEntries(readDcaJournal());
    refresh();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(DCA_JOURNAL_UPDATED_EVENT, refresh);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(DCA_JOURNAL_UPDATED_EVENT, refresh);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#111113] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div>
                <div className="mb-1 flex items-center gap-2 text-orange-300">
                  <History className="h-4 w-4" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    DCA Denník
                  </p>
                </div>
                <h3 className="text-lg font-bold text-white">História limitných príkazov</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Automaticky uložené pri aktivácii limitu alebo kopírovaní LMT ceny.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition-colors hover:text-white"
                aria-label="Zavrieť"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-white/5 px-5 py-3">
              <button
                type="button"
                onClick={downloadDcaJournalJson}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:text-white"
              >
                <FileJson className="h-3.5 w-3.5" />
                Exportovať JSON
              </button>
              <button
                type="button"
                onClick={downloadDcaJournalCsv}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Exportovať CSV
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
              {entries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
                  <p className="text-sm font-medium text-zinc-400">
                    Zatiaľ žiadne záznamy.
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Aktivujte limit alebo skopírujte LMT cenu v exekučnej karte.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <article
                      key={entry.id}
                      className="rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">
                            {entry.symbol}
                          </span>
                          <span className="text-xs text-zinc-500">{entry.tokenName}</span>
                        </div>
                        <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300">
                          {triggerLabel(entry.trigger)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                        <div>
                          <p className="text-zinc-600">Spot</p>
                          <p className="font-semibold tabular-nums text-zinc-200">
                            {formatUnitPrice(entry.spotPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-zinc-600">Limit</p>
                          <p className="font-semibold tabular-nums text-orange-300">
                            {formatUnitPrice(entry.limitPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-zinc-600">Suma</p>
                          <p className="font-semibold tabular-nums text-zinc-200">
                            {formatUsd(entry.limitUsd)}
                          </p>
                        </div>
                        <div>
                          <p className="text-zinc-600">RSI</p>
                          <p className="font-semibold tabular-nums text-zinc-200">
                            {entry.rsi14 != null ? formatRsi(entry.rsi14) : "—"}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                        {entry.note}
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {formatRecordedAt(entry.recordedAt)} · makro{" "}
                        {entry.macroTrend ?? "—"} · týždenný{" "}
                        {entry.shortTermTrend ?? "—"} · suma{" "}
                        {formatCopyAmount2(entry.limitUsd)} USD
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
