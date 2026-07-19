"use client";

import { motion } from "framer-motion";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatCrypto, formatUnitPrice, formatUsd } from "@/lib/data";
import type { LiveAsset } from "@/hooks/usePortfolio";
import {
  interactiveRow,
  listContainerVariants,
  listItemVariants,
} from "@/lib/motion";

const accentStyles = {
  orange: {
    ring: "ring-orange-500/30",
    bg: "bg-orange-500",
  },
  purple: {
    ring: "ring-purple-400/30",
    bg: "bg-purple-500",
  },
  cyan: {
    ring: "ring-cyan-400/30",
    bg: "bg-gradient-to-br from-cyan-400 to-purple-500",
  },
} as const;

interface AssetListProps {
  assets: LiveAsset[];
  loading?: boolean;
}

export function AssetList({ assets, loading = false }: AssetListProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Core Pillars
        </h2>
        <span className="text-xs text-zinc-600">P&L / ROI</span>
      </div>

      <motion.div
        variants={listContainerVariants}
        initial="hidden"
        animate="show"
        className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113]"
      >
        {assets.map((asset, index) => {
          const styles = accentStyles[asset.accent];
          const isPositive = asset.pnlUsd >= 0;

          return (
            <motion.div
              key={asset.symbol}
              variants={listItemVariants}
              {...interactiveRow}
              className={`flex items-center gap-4 px-4 py-4 ${
                index < assets.length - 1 ? "border-b border-white/5" : ""
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-2 ${styles.ring} ${styles.bg}`}
              >
                <span className="text-xs font-bold text-white">
                  {asset.symbol.slice(0, 1)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="font-semibold text-white">{asset.symbol}</p>
                  <p className="truncate text-xs text-zinc-500">{asset.name}</p>
                </div>
                <p className="text-sm text-zinc-400">
                  {formatCrypto(asset.balance, asset.symbol)}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  {loading ? (
                    <PriceSkeleton className="inline-block h-3 w-16" />
                  ) : asset.hasPurchaseHistory ? (
                    <>Avg @ {formatUnitPrice(asset.avgBuyPrice)}</>
                  ) : (
                    <>@ {formatUnitPrice(asset.unitPrice)}</>
                  )}
                </p>
              </div>

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
                ) : asset.hasPurchaseHistory ? (
                  <span
                    className={`mt-1 inline-block text-xs font-medium ${
                      isPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isPositive ? "+" : "-"}
                    {formatUsd(Math.abs(asset.pnlUsd))}{" "}
                    {isPositive ? "+" : "-"}
                    {Math.abs(asset.roiPercent).toFixed(1)}%
                  </span>
                ) : (
                  <span className="mt-1 inline-block text-xs font-medium text-zinc-600">
                    —
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.section>
  );
}
