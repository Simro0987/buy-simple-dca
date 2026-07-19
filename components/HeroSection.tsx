"use client";

import { motion } from "framer-motion";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MaskedValue } from "@/components/MaskedValue";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUsd } from "@/lib/data";
import {
  MASK_USD,
  MASK_USD_SIGNED,
} from "@/lib/privacyStorage";

interface HeroSectionProps {
  totalBalance: number;
  totalInvested: number;
  profitLoss: number;
  loading?: boolean;
  isLive?: boolean;
}

export function HeroSection({
  totalBalance,
  totalInvested,
  profitLoss,
  loading = false,
  isLive = false,
}: HeroSectionProps) {
  const isProfit = profitLoss >= 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Moje portfólio — USD
          </p>
          <LiveIndicator isLive={isLive} loading={loading} compact />
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
            {loading ? (
              <PriceSkeleton className="h-12 w-56 sm:h-14 sm:w-64" />
            ) : (
              <MaskedValue masked={MASK_USD}>
                {formatUsd(totalBalance)}
              </MaskedValue>
            )}
          </h1>
          <PrivacyToggle />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 backdrop-blur-md">
          <p className="text-xs font-medium text-zinc-500">Reálny vklad</p>
          <p className="mt-1 text-lg font-semibold text-zinc-200">
            {loading ? (
              <PriceSkeleton className="h-6 w-24" />
            ) : (
              <MaskedValue masked={MASK_USD}>
                {formatUsd(totalInvested)}
              </MaskedValue>
            )}
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">
            Celkovo investované cez DCA
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 backdrop-blur-md ${
            isProfit
              ? "border-emerald-400/20 bg-emerald-400/5"
              : "border-rose-400/20 bg-rose-400/5"
          }`}
        >
          <p className="text-xs font-medium text-zinc-500">Zisk / Strata</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              isProfit ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {loading ? (
              <PriceSkeleton className="h-6 w-24" />
            ) : (
              <MaskedValue masked={MASK_USD_SIGNED}>
                {formatUsd(profitLoss, { showSign: true })}
              </MaskedValue>
            )}
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">
            Nerealizovaný P&L
          </p>
        </div>
      </div>
    </motion.section>
  );
}
