"use client";

import { motion } from "framer-motion";
import { formatUsd } from "@/lib/data";

interface HeroSectionProps {
  totalBalance: number;
  realizedDeposit: number;
  profitLoss: number;
}

export function HeroSection({
  totalBalance,
  realizedDeposit,
  profitLoss,
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
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Moje portfólio — USD
        </p>
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
          {formatUsd(totalBalance)}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/5 bg-[#111113] p-4">
          <p className="text-xs font-medium text-zinc-500">Realizovaný vklad</p>
          <p className="mt-1 text-lg font-semibold text-zinc-300">
            {formatUsd(realizedDeposit, { showSign: true })}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/5 p-4">
          <p className="text-xs font-medium text-zinc-500">Zisk / Strata</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              isProfit ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatUsd(profitLoss, { showSign: true })}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
