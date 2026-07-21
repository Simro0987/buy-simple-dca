"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/src/store/useAppStore";

const buttonClass = "transition-all duration-300 ease-in-out";

export function TradingModeToggle({ compact = false }: { compact?: boolean }) {
  const tradingMode = useAppStore((state) => state.tradingMode);
  const setTradingMode = useAppStore((state) => state.setTradingMode);

  if (compact) {
    return (
      <div className={`inline-flex rounded-full border border-white/10 bg-white/[0.03] p-0.5 ${buttonClass}`}>
        <button
          type="button"
          onClick={() => setTradingMode("simulation")}
          className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${buttonClass} ${
            tradingMode === "simulation"
              ? "bg-zinc-700 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Sim
        </button>
        <button
          type="button"
          onClick={() => setTradingMode("live")}
          className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${buttonClass} ${
            tradingMode === "live"
              ? "bg-emerald-500/20 text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Live
        </button>
      </div>
    );
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border border-white/5 bg-[#0d0d0f] p-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Trading Mode
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Simulácia ponechá vizuálny deploy. Live Trading odošle príkazy cez
        zabezpečené server API (kľúče nikdy nie sú na frontende).
      </p>
      <div className="mt-3 inline-flex rounded-full border border-white/10 bg-black/40 p-1">
        <button
          type="button"
          onClick={() => setTradingMode("simulation")}
          className={`rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wide ${buttonClass} ${
            tradingMode === "simulation"
              ? "bg-zinc-700 text-white shadow-inner"
              : "text-zinc-500"
          }`}
        >
          Simulácia (Test)
        </button>
        <button
          type="button"
          onClick={() => setTradingMode("live")}
          className={`rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wide ${buttonClass} ${
            tradingMode === "live"
              ? "bg-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]"
              : "text-zinc-500"
          }`}
        >
          Live Trading
        </button>
      </div>
    </motion.div>
  );
}
