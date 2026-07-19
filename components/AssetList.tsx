"use client";

import { motion } from "framer-motion";
import { formatCrypto, formatUsd } from "@/lib/data";

type Accent = "orange" | "purple" | "cyan";

interface Asset {
  symbol: string;
  name: string;
  balance: number;
  usdValue: number;
  change7d: number;
  accent: Accent;
}

const accentStyles: Record<
  Accent,
  { ring: string; bg: string; text: string }
> = {
  orange: {
    ring: "ring-orange-500/30",
    bg: "bg-orange-500",
    text: "text-orange-500",
  },
  purple: {
    ring: "ring-purple-400/30",
    bg: "bg-purple-500",
    text: "text-purple-400",
  },
  cyan: {
    ring: "ring-cyan-400/30",
    bg: "bg-gradient-to-br from-cyan-400 to-purple-500",
    text: "text-cyan-400",
  },
};

interface AssetListProps {
  assets: Asset[];
}

export function AssetList({ assets }: AssetListProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Core Pillars
        </h2>
        <span className="text-xs text-zinc-600">7D change</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113]">
        {assets.map((asset, index) => {
          const styles = accentStyles[asset.accent];
          const isPositive = asset.change7d >= 0;

          return (
            <motion.div
              key={asset.symbol}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + index * 0.08 }}
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
              </div>

              <div className="text-right">
                <p className="font-semibold text-white">
                  {formatUsd(asset.usdValue)}
                </p>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    isPositive
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {asset.change7d.toFixed(2)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
