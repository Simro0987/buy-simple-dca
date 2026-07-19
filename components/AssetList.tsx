"use client";

import { motion } from "framer-motion";
import { AssetRow } from "@/components/AssetRow";
import type { LiveAsset } from "@/hooks/usePortfolio";
import { listContainerVariants } from "@/lib/motion";

interface AssetListProps {
  assets: LiveAsset[];
  loading?: boolean;
  onOpenTransactions: (asset: LiveAsset) => void;
}

export function AssetList({
  assets,
  loading = false,
  onOpenTransactions,
}: AssetListProps) {
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
        {assets.map((asset, index) => (
          <AssetRow
            key={asset.id}
            asset={asset}
            index={index}
            total={assets.length}
            loading={loading}
            variant="core"
            onOpenTransactions={onOpenTransactions}
          />
        ))}
      </motion.div>
    </motion.section>
  );
}
