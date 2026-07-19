"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MoreVertical } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import type { LiveAsset } from "@/hooks/usePortfolio";
import { getCategoryDotClass, getCategoryStyles } from "@/lib/assetStyles";
import { formatCrypto, formatUsd } from "@/lib/data";
import { interactiveRow } from "@/lib/motion";
import type { Transaction } from "@/lib/portfolioStorage";

function formatTransactionDate(date: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function transactionTypeLabel(type: Transaction["type"]) {
  if (type === "ADD") return "Pridať";
  if (type === "REMOVE") return "Odstrániť";
  return "DCA";
}

interface AssetRowProps {
  asset: LiveAsset;
  index: number;
  total: number;
  loading?: boolean;
  onOpenTransactions: (asset: LiveAsset) => void;
}

export function AssetRow({
  asset,
  index,
  total,
  loading = false,
  onOpenTransactions,
}: AssetRowProps) {
  const [expanded, setExpanded] = useState(false);
  const categoryStyles = getCategoryStyles(asset.category);

  const isPositive = asset.pnlUsd >= 0;
  const pnlLabel = asset.hasPurchaseHistory
    ? `${isPositive ? "+" : "-"}${formatUsd(Math.abs(asset.pnlUsd))} ${isPositive ? "+" : "-"}${Math.abs(asset.roiPercent).toFixed(1)}%`
    : asset.category === "yield"
      ? "+$0.00 +0.0%"
      : "—";

  return (
    <div className={index < total - 1 ? "border-b border-white/5" : ""}>
      <motion.div
        {...interactiveRow}
        className="flex items-center gap-3 px-4 py-4"
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-white/10">
            {asset.logoUrl ? (
              <Image
                src={asset.logoUrl}
                alt={asset.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center ${categoryStyles.bg} ring-2 ${categoryStyles.ring}`}
              >
                <span className="text-xs font-bold text-white">
                  {asset.symbol.slice(0, 1)}
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${getCategoryDotClass(asset.category)}`}
                aria-hidden
              />
              <p className="font-semibold text-white">{asset.symbol}</p>
              <p className="truncate text-xs text-zinc-500">{asset.name}</p>
              {asset.category === "yield" && (
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400">
                  EARNING
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400">
              {loading ? (
                <PriceSkeleton className="inline-block h-4 w-24" />
              ) : (
                formatCrypto(asset.balance, asset.symbol)
              )}
            </p>
          </div>
        </button>

        <div className="text-right">
          <p className="font-semibold text-white">
            {loading ? (
              <PriceSkeleton className="ml-auto h-5 w-20" />
            ) : (
              formatUsd(asset.usdValue)
            )}
          </p>
          {loading ? (
            <PriceSkeleton className="ml-auto mt-1 h-5 w-14" />
          ) : asset.hasPurchaseHistory || asset.category === "yield" ? (
            <span
              className={`mt-1 inline-block text-xs font-medium ${
                isPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {pnlLabel}
            </span>
          ) : (
            <span className="mt-1 inline-block text-xs font-medium text-zinc-600">
              —
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenTransactions(asset)}
          aria-label={`Spravovať transakcie ${asset.symbol}`}
          className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Zbaliť históriu" : "Rozbaliť históriu"}
          className="rounded-full p-1 text-zinc-500 transition hover:text-zinc-300"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </motion.div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 bg-black/20 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                História transakcií
              </p>

              {asset.transactions.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Zatiaľ žiadne transakcie. Použi menu ⋮ pre pridanie.
                </p>
              ) : (
                <div className="space-y-2">
                  {asset.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#111113] px-3 py-2"
                    >
                      <div>
                        <p
                          className={`text-xs font-semibold ${
                            tx.type === "REMOVE"
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {transactionTypeLabel(tx.type)}
                        </p>
                        <p className="text-[10px] text-zinc-600">
                          {formatTransactionDate(tx.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-white">
                          {tx.type === "REMOVE" ? "-" : "+"}
                          {tx.amount.toFixed(6)} {asset.symbol}
                        </p>
                        {tx.spentUsd > 0 && (
                          <p className="text-[10px] text-zinc-500">
                            {formatUsd(tx.spentUsd)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
