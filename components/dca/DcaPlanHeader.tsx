"use client";

import { motion } from "framer-motion";
import { Sparkles, Wand2, Zap } from "lucide-react";
import { formatWeekStart } from "@/lib/dca/format";
import { glassInset } from "@/lib/dca/glass";
import { interactiveButton } from "@/lib/motion";

interface DcaPlanHeaderProps {
  moneyMode: boolean;
  onToggleMoneyMode: () => void;
  onRitual: () => void;
  onAutoFill: () => void;
}

export function DcaPlanHeader({
  moneyMode,
  onToggleMoneyMode,
  onRitual,
  onAutoFill,
}: DcaPlanHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Edge Trader · DCA
        </p>
        <h2 className="mt-1 text-lg font-bold leading-snug text-white">
          DCA Exekučný plán na týždeň · {formatWeekStart()}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <motion.button
          type="button"
          onClick={onRitual}
          {...interactiveButton}
          className={`${glassInset} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-200`}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          Rituál
        </motion.button>
        <motion.button
          type="button"
          onClick={onAutoFill}
          {...interactiveButton}
          className={`${glassInset} inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-200`}
        >
          <Wand2 className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
          Auto-fill
        </motion.button>
        <motion.button
          type="button"
          role="switch"
          aria-checked={moneyMode}
          onClick={onToggleMoneyMode}
          {...interactiveButton}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
            moneyMode
              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.25)]"
              : "border-white/10 bg-zinc-900/70 text-zinc-400"
          }`}
        >
          <Zap
            className={`h-3.5 w-3.5 ${moneyMode ? "fill-emerald-400 text-emerald-400" : ""}`}
            aria-hidden="true"
          />
          Money Mode
        </motion.button>
      </div>
    </motion.header>
  );
}
