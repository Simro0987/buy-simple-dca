"use client";

import { motion } from "framer-motion";
import { AssetRow } from "@/components/AssetRow";
import type { LiveAsset } from "@/hooks/usePortfolio";
import { getCategoryLabel, getCategoryStyles } from "@/lib/assetStyles";
import type { AssetCategory } from "@/lib/portfolioStorage";
import { listContainerVariants } from "@/lib/motion";

interface AssetListProps {
  title?: string;
  category: AssetCategory;
  assets: LiveAsset[];
  loading?: boolean;
  onOpenTransactions: (asset: LiveAsset) => void;
}

export function AssetList({
  title,
  category,
  assets,
  loading = false,
  onOpenTransactions,
}: AssetListProps) {
  const styles = getCategoryStyles(category);
  const heading = title ?? getCategoryLabel(category).toUpperCase();

  if (assets.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: styles.color }}
          />
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: styles.color }}
          >
            {heading}
          </h2>
        </div>
        {category !== "satellite" && (
          <span className="text-xs text-zinc-600">P&L / ROI</span>
        )}
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
            onOpenTransactions={onOpenTransactions}
          />
        ))}
      </motion.div>
    </motion.section>
  );
}
