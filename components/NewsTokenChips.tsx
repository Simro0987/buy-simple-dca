"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { LayoutGrid } from "lucide-react";
import type { PortfolioTokenRef } from "@/lib/newsTokenFilter";
import { springTransition } from "@/lib/motion";

interface NewsTokenChipsProps {
  tokens: PortfolioTokenRef[];
  selectedToken: string | null;
  onSelect: (symbol: string | null) => void;
}

export function NewsTokenChips({
  tokens,
  selectedToken,
  onSelect,
}: NewsTokenChipsProps) {
  if (tokens.length === 0) return null;

  return (
    <div className="relative -mx-1">
      <div className="flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <motion.button
          type="button"
          onClick={() => onSelect(null)}
          whileTap={{ scale: 0.96 }}
          transition={springTransition}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
            selectedToken === null
              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-400"
              : "border-white/10 bg-[#111113] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Všetky
        </motion.button>

        {tokens.map((token) => {
          const isActive =
            selectedToken?.toUpperCase() === token.symbol.toUpperCase();

          return (
            <motion.button
              key={token.symbol}
              type="button"
              onClick={() => onSelect(token.symbol)}
              whileTap={{ scale: 0.96 }}
              transition={springTransition}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border py-2 pl-1.5 pr-3 text-xs font-semibold transition ${
                isActive
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-400"
                  : "border-white/10 bg-[#111113] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              }`}
            >
              <span className="relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/10">
                {token.logoUrl ? (
                  <Image
                    src={token.logoUrl}
                    alt={token.symbol}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-zinc-800 text-[8px] font-bold text-white">
                    {token.symbol.slice(0, 1)}
                  </span>
                )}
              </span>
              {token.symbol}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
