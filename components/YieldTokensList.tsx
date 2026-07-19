"use client";

import { motion } from "framer-motion";
import { AssetRow } from "@/components/AssetRow";
import type { LiveAsset } from "@/hooks/usePortfolio";
import { listContainerVariants } from "@/lib/motion";

interface YieldTokensListProps {
  assets: LiveAsset[];
  loading?: boolean;
  onOpenTransactions: (asset: LiveAsset) => void;
}

export function YieldTokensList({
  assets,
  loading = false,
  onOpenTransactions,
}: YieldTokensListProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Yield Tokeny
      </h2>

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
            variant="yield"
            onOpenTransactions={onOpenTransactions}
          />
        ))}
      </motion.div>
    </motion.section>
  );
}
