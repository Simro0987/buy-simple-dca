"use client";

import { motion } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";
import { formatWeekStart } from "@/lib/dca/format";
import { glassInset } from "@/lib/dca/glass";
import { interactiveButton } from "@/lib/motion";

interface DcaPlanHeaderProps {
  onRitual: () => void;
  onAutoFill: () => void;
}

export function DcaPlanHeader({ onRitual, onAutoFill }: DcaPlanHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <h2 className="text-lg font-bold leading-snug tracking-tight text-white">
        DCA Exekučný plán na týždeň - {formatWeekStart()}
      </h2>
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
          <Wand2 className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          Auto-fill
        </motion.button>
      </div>
    </motion.header>
  );
}
