"use client";

import { motion } from "framer-motion";
import type { LiveAsset } from "@/hooks/usePortfolio";
import { getCategoryStyles } from "@/lib/assetStyles";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";

interface PortfolioBubbleAllocationProps {
  assets: LiveAsset[];
  loading?: boolean;
}

export function PortfolioBubbleAllocation({
  assets,
  loading = false,
}: PortfolioBubbleAllocationProps) {
  const total = assets.reduce((sum, asset) => sum + asset.usdValue, 0);

  const bubbles = assets
    .map((asset) => ({
      symbol: asset.symbol,
      category: asset.category,
      usdValue: asset.usdValue,
      percent: total > 0 ? (asset.usdValue / total) * 100 : 0,
    }))
    .filter((item) => item.usdValue > 0)
    .sort((a, b) => b.percent - a.percent);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.04, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-4"
    >
      <div className="mb-4 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Portfólio Allocation
        </p>
        <p className="text-sm font-medium text-zinc-400">
          Podiel jednotlivých tokenov
        </p>
      </div>

      {loading ? (
        <PriceSkeleton className="h-28 w-full rounded-2xl" />
      ) : bubbles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
          <p className="text-sm text-zinc-500">
            Zatiaľ žiadna alokácia. Pridaj transakcie alebo tokeny.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-end justify-center gap-5 px-2 py-2">
          {bubbles.map((bubble) => {
            const styles = getCategoryStyles(bubble.category);
            const size = Math.max(44, Math.min(92, 44 + bubble.percent * 1.4));

            return (
              <div
                key={bubble.symbol}
                className="flex flex-col items-center gap-1.5"
              >
                <div
                  className={`rounded-full ${styles.bubble} ${styles.bubbleGlow} transition-transform hover:scale-105`}
                  style={{ width: size, height: size }}
                  title={`${bubble.symbol} — ${bubble.percent.toFixed(1)}%`}
                />
                <p className="text-xs font-bold text-white">{bubble.symbol}</p>
                <p className={`text-[10px] font-semibold ${styles.label}`}>
                  {bubble.percent.toFixed(1)}%
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-4 border-t border-white/5 pt-3">
        {(["core", "yield", "satellite"] as const).map((category) => {
          const styles = getCategoryStyles(category);
          const label =
            category === "core"
              ? "Core"
              : category === "yield"
                ? "Yield"
                : "Satellites";

          return (
            <div key={category} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
