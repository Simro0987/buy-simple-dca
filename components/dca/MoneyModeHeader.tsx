"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";

interface MoneyModeHeaderProps {
  mode: string;
  score: number;
}

export function MoneyModeHeader({ mode, score }: MoneyModeHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex items-center justify-between gap-4"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.25)]">
        <Zap className="h-3.5 w-3.5 fill-emerald-400" />
        Money Mode: {mode}
      </span>

      <div className="text-right">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Score
        </p>
        <p className="flex items-baseline justify-end gap-0.5">
          <span className="text-4xl font-black leading-none text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]">
            {score}
          </span>
          <span className="text-sm font-medium text-zinc-600">/100</span>
        </p>
      </div>
    </motion.div>
  );
}
