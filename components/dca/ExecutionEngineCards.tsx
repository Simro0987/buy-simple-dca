"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUnitPrice, formatUsd } from "@/lib/data";
import { getCategoryStyles } from "@/lib/assetStyles";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { sumExecutionOrders } from "@/lib/dcaFinalExecutionOrders";
import {
  interactiveCard,
  smoothWidthTransition,
} from "@/lib/motion";

interface ExecutionEngineCardsProps {
  finalExecutionOrders: TokenExecutionPlan[];
  deployedCapital?: number;
  loading?: boolean;
}

const listItemMotion = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98, height: 0, marginBottom: 0 },
  transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
};

export function ExecutionEngineCards({
  finalExecutionOrders,
  deployedCapital = 0,
  loading = false,
}: ExecutionEngineCardsProps) {
  const ordersTotal = sumExecutionOrders(finalExecutionOrders);

  return (
    <motion.section
      layout
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
        <p className="mt-1 text-[10px] text-zinc-500">
          {finalExecutionOrders.length} príkazov • filter 3/3 yield • celkom{" "}
          <span className="font-semibold text-emerald-400">
            {formatUsd(ordersTotal)}
          </span>
          {deployedCapital > 0 && (
            <span className="text-zinc-600">
              {" "}
              / {formatUsd(deployedCapital)} deploy
            </span>
          )}
        </p>
      </div>

      <motion.div layout className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {finalExecutionOrders.map((plan) => {
            const catStyles = getCategoryStyles(plan.category);
            const unitPrice = plan.spotPrice;

            return (
              <motion.article
                key={plan.symbol}
                layout
                {...listItemMotion}
                {...interactiveCard}
                className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-4"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full ring-2 ${catStyles.ring}`}
                      style={{ backgroundColor: `${catStyles.color}20` }}
                    >
                      {plan.logoUrl ? (
                        <Image
                          src={plan.logoUrl}
                          alt={plan.symbol}
                          width={28}
                          height={28}
                          className="rounded-full"
                          unoptimized
                        />
                      ) : (
                        <span
                          className="text-xs font-bold"
                          style={{ color: catStyles.color }}
                        >
                          {plan.symbol.slice(0, 1)}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-bold text-white">
                          {plan.symbol}
                        </p>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase"
                          style={{
                            color: catStyles.color,
                            backgroundColor: `${catStyles.color}15`,
                          }}
                        >
                          {plan.category}
                        </span>
                        {plan.yieldMergeActive && (
                          <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-400">
                            Merge
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">{plan.name}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-600">
                        {loading ? (
                          <PriceSkeleton className="inline-block h-3 w-20" />
                        ) : plan.marketStatusFallback ? (
                          <span className="text-amber-400/80">
                            Market Status ·{" "}
                            {plan.change24h >= 0 ? "+" : ""}
                            {plan.change24h.toFixed(1)}% 24h
                          </span>
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
                    <p
                      className="text-lg font-bold tabular-nums transition-all duration-700 ease-in-out"
                      style={{ color: catStyles.color }}
                    >
                      {plan.weightPercent}%
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-white transition-all duration-700 ease-in-out">
                      {formatUsd(plan.totalUsd)}
                    </p>
                  </div>
                </div>

                <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-zinc-800/80">
                  <motion.div
                    layout
                    initial={false}
                    animate={{ width: `${plan.marketShare}%` }}
                    transition={smoothWidthTransition}
                    className="h-full bg-emerald-400"
                    title="Market"
                  />
                  <motion.div
                    layout
                    initial={false}
                    animate={{ width: `${plan.limitShare}%` }}
                    transition={smoothWidthTransition}
                    className="h-full bg-orange-500"
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
                    <p className="mt-1 text-base font-bold tabular-nums text-white transition-all duration-700 ease-in-out">
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
                    <p className="mt-1 text-base font-bold tabular-nums text-white transition-all duration-700 ease-in-out">
                      {formatUsd(plan.limitUsd)}
                    </p>
                    {plan.limitPrice > 0 && (
                      <p className="mt-0.5 text-[10px] text-orange-400/70">
                        @ {formatUnitPrice(plan.limitPrice)}
                      </p>
                    )}
                  </div>
                </div>

                {plan.limitShare > 0 && plan.whyLimit && (
                  <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                      Prečo limit?
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                      {plan.whyLimit}
                    </p>
                  </div>
                )}
              </motion.article>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </motion.section>
  );
}
