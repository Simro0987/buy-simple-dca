"use client";

import { motion } from "framer-motion";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUnitPrice, formatUsd } from "@/lib/data";
import { tokenAccentStyles } from "@/lib/dcaData";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { CryptoPricesMap } from "@/lib/cryptoApi";
import {
  interactiveCard,
  listContainerVariants,
  listItemVariants,
} from "@/lib/motion";

interface ExecutionEngineCardsProps {
  plans: TokenExecutionPlan[];
  prices?: CryptoPricesMap;
  loading?: boolean;
}

export function ExecutionEngineCards({
  plans,
  prices,
  loading = false,
}: ExecutionEngineCardsProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Execution Engine
        </p>
        <h3 className="mt-1 text-sm font-bold text-white">
          Dynamic Split · MKT / LMT
        </h3>
      </div>

      <motion.div
        variants={listContainerVariants}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        {plans.map((plan) => {
          const styles = tokenAccentStyles[plan.accent];
          const unitPrice = prices?.[plan.symbol]?.price ?? 0;

          return (
            <motion.article
              key={plan.symbol}
              variants={listItemVariants}
              {...interactiveCard}
              className="rounded-3xl border border-white/5 bg-[#111113] p-4"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ${styles.icon}`}
                  >
                    {plan.symbol.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">
                      {plan.symbol}
                    </p>
                    <p className="text-xs text-zinc-500">{plan.name}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {loading ? (
                        <PriceSkeleton className="inline-block h-3 w-20" />
                      ) : (
                        <>Live @ {formatUnitPrice(unitPrice)}</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Týždenný podiel
                  </p>
                  <p className={`text-lg font-bold ${styles.text}`}>
                    {plan.weightPercent}%
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {formatUsd(plan.totalUsd)}
                  </p>
                </div>
              </div>

              <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-zinc-800/80">
                <motion.div
                  layout
                  className="h-full bg-emerald-400"
                  style={{ width: `${plan.marketShare}%` }}
                  title="Market"
                />
                <motion.div
                  layout
                  className="h-full bg-orange-500"
                  style={{ width: `${plan.limitShare}%` }}
                  title="Limit"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      MKT
                    </span>
                    <span className="text-[10px] font-medium text-zinc-500">
                      {plan.marketShare}%
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-white">
                    {formatUsd(plan.marketUsd)}
                  </p>
                </div>
                <div className="rounded-2xl border border-orange-500/15 bg-orange-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                      LMT
                    </span>
                    <span className="text-[10px] font-medium text-zinc-500">
                      {plan.limitShare}%
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold text-white">
                    {formatUsd(plan.limitUsd)}
                  </p>
                </div>
              </div>
            </motion.article>
          );
        })}
      </motion.div>
    </motion.section>
  );
}
