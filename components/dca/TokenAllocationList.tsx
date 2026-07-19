"use client";

import { motion } from "framer-motion";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUnitPrice, formatUsd } from "@/lib/data";
import {
  tokenAccentStyles,
  type TokenAccent,
} from "@/lib/dcaData";
import type { CryptoPricesMap } from "@/lib/cryptoApi";

interface TokenAllocation {
  symbol: string;
  name: string;
  weight: number;
  amount: number;
  marketShare: number;
  limitShare: number;
  accent: TokenAccent;
}

interface TokenAllocationListProps {
  tokens: TokenAllocation[];
  prices?: CryptoPricesMap;
  loading?: boolean;
}

export function TokenAllocationList({
  tokens,
  prices,
  loading = false,
}: TokenAllocationListProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.24, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Dynamic Execution Engine
        </p>
        <div className="flex items-center gap-3 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full bg-amber-400" />
            Market
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full bg-orange-500" />
            Limit
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {tokens.map((token, index) => {
          const styles = tokenAccentStyles[token.accent];
          const marketWidth = (token.weight * token.marketShare) / 100;
          const limitWidth = (token.weight * token.limitShare) / 100;
          const unitPrice =
            prices?.[token.symbol as keyof CryptoPricesMap]?.price ?? 0;

          return (
            <motion.div
              key={token.symbol}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.28 + index * 0.07 }}
              className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ${styles.icon}`}
                  >
                    {token.symbol.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {token.symbol}
                    </p>
                    <p className="text-[10px] text-zinc-500">{token.name}</p>
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
                  <p className={`text-sm font-bold ${styles.text}`}>
                    {loading ? (
                      <PriceSkeleton className="ml-auto h-5 w-16" />
                    ) : (
                      formatUsd(token.amount)
                    )}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    váha {token.weight}%
                  </p>
                </div>
              </div>

              <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800/80">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${marketWidth}%` }}
                  transition={{ duration: 0.7, delay: 0.35 + index * 0.08 }}
                  className={`h-full ${styles.market}`}
                  title={`Market ${token.marketShare}%`}
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${limitWidth}%` }}
                  transition={{ duration: 0.7, delay: 0.45 + index * 0.08 }}
                  className={`h-full ${styles.limit}`}
                  title={`Limit ${token.limitShare}%`}
                />
              </div>

              <div className="mt-2 flex justify-between text-[9px] font-medium text-zinc-600">
                <span>
                  Market {token.marketShare}% ·{" "}
                  {loading ? (
                    <PriceSkeleton className="inline-block h-3 w-12 align-middle" />
                  ) : (
                    formatUsd(token.amount * (token.marketShare / 100))
                  )}
                </span>
                <span>
                  Limit {token.limitShare}% ·{" "}
                  {loading ? (
                    <PriceSkeleton className="inline-block h-3 w-12 align-middle" />
                  ) : (
                    formatUsd(token.amount * (token.limitShare / 100))
                  )}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
