"use client";

import { motion } from "framer-motion";
import { FactorPills } from "@/components/dca/FactorPills";
import { MarketRegimeSection } from "@/components/dca/MarketRegimeSection";
import { MoneyModeHeader } from "@/components/dca/MoneyModeHeader";
import { TokenAllocationList } from "@/components/dca/TokenAllocationList";
import { dcaEngineData } from "@/lib/dcaData";
import type { CryptoPricesMap } from "@/lib/cryptoApi";

interface DcaMoneyModePanelProps {
  prices?: CryptoPricesMap;
  loading?: boolean;
}

export function DcaMoneyModePanel({
  prices,
  loading = false,
}: DcaMoneyModePanelProps) {
  const { moneyMode, score, marketRegime, factors, tokenAllocations } =
    dcaEngineData;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-red-500/8 blur-3xl" />

      <div className="relative space-y-5">
        <div className="space-y-1 border-b border-white/5 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            DCA & Money Mode
          </p>
          <h2 className="text-base font-bold text-white">
            Execution Intelligence
          </h2>
        </div>

        <MoneyModeHeader mode={moneyMode} score={score} />
        <MarketRegimeSection
          label={marketRegime.label}
          description={marketRegime.description}
          finalScore={marketRegime.finalScore}
          allocationPercent={marketRegime.allocationPercent}
          investmentAmount={marketRegime.investmentAmount}
        />
        <FactorPills factors={factors} confluenceScore={score} />
        <TokenAllocationList
          tokens={tokenAllocations}
          prices={prices}
          loading={loading}
        />
      </div>
    </motion.section>
  );
}
