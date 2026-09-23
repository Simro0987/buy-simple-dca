"use client";

import { motion } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";
import { formatWeekStart } from "@/lib/dca/format";
import { glassInset } from "@/lib/dca/glass";
import type { Phase12Sim } from "@/lib/dca/types";
import { interactiveButton } from "@/lib/motion";
import { formatLiveClock, useLiveClockStore } from "@/store/liveClockStore";

interface DcaPlanHeaderProps {
  onRitual: () => void;
  onAutoFill: () => void;
  sim: Phase12Sim;
  onSim: (sim: Phase12Sim) => void;
}

export function DcaPlanHeader({
  onRitual,
  onAutoFill,
  sim,
  onSim,
}: DcaPlanHeaderProps) {
  const lastUpdatedAt = useLiveClockStore((state) => state.lastUpdatedAt);
  const connected = useLiveClockStore((state) => state.connected);

  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-bold leading-snug tracking-tight text-white">
          DCA Exekučný plán na týždeň - {formatWeekStart()}
        </h2>
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            connected
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/40 bg-amber-400/10 text-amber-200"
          }`}
        >
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                connected ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
          </span>
          <span>
            LIVE API: {connected ? "Pripojené" : "Odpojené"} | Posledná aktualizácia:{" "}
            {formatLiveClock(lastUpdatedAt)}
          </span>
        </div>
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
          <Wand2 className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          Auto-fill
        </motion.button>
        <div className="ml-auto flex flex-wrap gap-1" role="group" aria-label="Simulácia Phase 12">
          {(
            [
              ["off", "LIVE"],
              ["flash", "FLASH"],
              ["trim", "TRIM"],
              ["knife", "DYKA"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onSim(value)}
              className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                sim === value
                  ? "border-violet-400/50 bg-violet-400/15 text-violet-200"
                  : "border-white/10 bg-white/5 text-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </motion.header>
  );
}
