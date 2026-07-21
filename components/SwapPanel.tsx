"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight, Info } from "lucide-react";
import { useMemo } from "react";
import { AssetLogo } from "@/components/AssetLogo";
import { formatUsd } from "@/lib/data";
import { getCategoryStyles } from "@/lib/assetStyles";
import { useAppStore } from "@/src/store/useAppStore";

export function SwapPanel() {
  const portfolioAssets = useAppStore((state) => state.portfolioAssets);
  const apiStatus = useAppStore((state) => state.apiStatus);

  const swappable = useMemo(
    () => portfolioAssets.filter((asset) => asset.unitPrice > 0),
    [portfolioAssets],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Swap
        </p>
        <h2 className="text-xl font-bold text-white">Výmena tokenov</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Rýchly prehľad aktív pripravených na výmenu
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs text-zinc-400">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p>
            Ceny cez proxy ({apiStatus.prices.source}) ·{" "}
            {apiStatus.prices.degraded ? "degraded" : "live"}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {swappable.length === 0 ? (
          <div className="rounded-3xl border border-white/5 bg-[#111113] p-6 text-center text-sm text-zinc-500">
            Pridaj tokeny do portfólia pre swap prehľad.
          </div>
        ) : (
          swappable.map((asset) => {
            const styles = getCategoryStyles(asset.category);
            return (
              <div
                key={asset.id}
                className="flex items-center justify-between rounded-3xl border border-white/5 bg-[#111113] p-4"
              >
                <div className="flex items-center gap-3">
                  <AssetLogo
                    symbol={asset.symbol}
                    name={asset.name}
                    logoUrl={asset.logoUrl}
                    category={asset.category}
                    size={40}
                  />
                  <div>
                    <p className="font-bold text-white">{asset.symbol}</p>
                    <p className="text-xs text-zinc-500">{asset.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">
                    {formatUsd(asset.usdValue)}
                  </p>
                  <p
                    className="text-[10px] font-medium uppercase"
                    style={{ color: styles.color }}
                  >
                    {asset.category}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-semibold text-zinc-500"
      >
        <ArrowLeftRight className="h-4 w-4" />
        Swap engine — čoskoro
      </button>
    </motion.div>
  );
}
