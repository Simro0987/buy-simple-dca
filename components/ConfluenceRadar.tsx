"use client";

import { motion } from "framer-motion";
import {
  ConfluenceOctagonPanel,
  TokenOctagonChips,
} from "@/components/dca/ConfluenceOctagonPanel";
import { useConfluenceOctagon } from "@/hooks/useConfluenceOctagon";
import { interactiveCard } from "@/lib/motion";
import type { TrackedAsset } from "@/lib/portfolioStorage";

interface ConfluenceRadarProps {
  fearGreed?: number;
  portfolioSymbols?: string[];
  trackedAssets?: TrackedAsset[];
}

export function ConfluenceRadar({
  fearGreed = 50,
  portfolioSymbols,
  trackedAssets,
}: ConfluenceRadarProps) {
  const {
    tokens,
    selectedToken,
    setSelectedToken,
    activeSnapshot,
    scoresBySymbol,
    loading,
    tokenSwitchLoading,
    error,
    usingPortfolioTokens,
  } = useConfluenceOctagon(fearGreed, portfolioSymbols, trackedAssets);

  const metrics = activeSnapshot?.metrics ?? [];
  const accumulationScore = activeSnapshot?.accumulationScore ?? 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={interactiveCard.whileHover}
      whileTap={interactiveCard.whileTap}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-emerald-400/8 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
              Confluence Octagon
            </p>
            <h2 className="mt-1 text-base font-bold text-white">
              Makro akumulácia · {selectedToken}
            </h2>
            <p className="mt-1 text-[10px] text-zinc-500">
              {usingPortfolioTokens ? "Tokeny z Portfólia" : "Predvolený kôš"}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              {loading ? "Sync" : activeSnapshot?.live ? "Live" : "Cache"}
            </span>
          </span>
        </div>

        <div className="mb-4">
          <TokenOctagonChips
            tokens={tokens}
            selectedToken={selectedToken}
            onSelect={setSelectedToken}
            scores={scoresBySymbol}
            accent="emerald"
          />
        </div>

        {error ? (
          <p className="mb-3 text-[10px] text-amber-400">{error}</p>
        ) : null}

        <ConfluenceOctagonPanel
          selectedToken={selectedToken}
          metrics={metrics}
          accumulationScore={accumulationScore}
          loading={tokenSwitchLoading}
        />
      </div>
    </motion.section>
  );
}
