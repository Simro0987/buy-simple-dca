"use client";

import { ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { formatUsd } from "@/lib/data";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import type { WeeklyDcaPlan } from "@/lib/dca/types";

function BitcoinMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-300" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <path
        fill="currentColor"
        d="M13.4 11.7c1.4-.3 2.3-1.1 2.1-2.5-.2-1.3-1.3-1.7-2.8-1.8V5.8h-1.3v1.5c-.3 0-.7 0-1 0V5.8H9v1.6H7.4v1.4h1.5c.4 0 .6.2.6.6v5.5c0 .5-.2.7-.7.7H7.3v1.4H9v1.6h1.4v-1.6h1.3v1.6h1.3v-1.6c1.8-.1 3.1-.7 3.4-2.3.2-1.2-.4-1.9-1.5-2.2Zm-3.7-3.4c.2 0 1.8 0 2.2.1.8.1 1.2.5 1.3 1.1.1.7-.4 1.2-1.5 1.3h-2V8.3Zm2.4 6.6h-2.4v-2.6h2.4c1.2 0 1.8.4 1.9 1.2.1.8-.5 1.3-1.9 1.4Z"
      />
    </svg>
  );
}

interface AllocationRulesCardProps {
  plan: WeeklyDcaPlan;
  cashReserveUsd: number;
  whyOpen: boolean;
  onToggleWhy: () => void;
}

export function AllocationRulesCard({
  plan,
  cashReserveUsd,
  whyOpen,
  onToggleWhy,
}: AllocationRulesCardProps) {
  const btcFill = Math.max(plan.corePercent, 50);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${glassPanel} p-5`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Základné alokačné pravidlo
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-300">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <BitcoinMark />
            BTC Podiel
          </span>
          <span className="font-bold text-emerald-300">{btcFill.toFixed(0)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-zinc-800/90">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-lime-300 shadow-[0_0_16px_rgba(52,211,153,0.45)]"
            style={{ width: `${Math.min(100, btcFill)}%` }}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          BTC musí tvoriť najmenej 50% nákupného kapitálu. Zvyšok je dynamický podľa
          satelitov, high-beta vrstvy a STOP režimu.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Hotovosť rezerva
          </p>
          <p className="mt-1 text-sm font-bold tabular-nums text-white transition-all duration-500">
            {formatUsd(plan.reserveUsd + cashReserveUsd)}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Týždeň {formatUsd(plan.reserveUsd - plan.brakeBoostReserveDelta)} · cash{" "}
            {formatUsd(cashReserveUsd)}
          </p>
          {plan.brakeBoostReserveDelta !== 0 && (
            <p
              className={`mt-0.5 text-[10px] font-semibold ${
                plan.brakeBoostReserveDelta > 0 ? "text-amber-300" : "text-lime-300"
              }`}
            >
              Brzda & boost{" "}
              {formatUsd(plan.brakeBoostReserveDelta, { showSign: true })}
              {plan.brakeBoostReserveDelta > 0 ? " z MKT" : " do MKT"}
            </p>
          )}
        </div>
        <div className={`${glassInset} p-3`}>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Týždenný kapitál
          </p>
          <p className="mt-1 text-sm font-bold text-emerald-300">
            {formatUsd(plan.weeklyAmount)}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Nasadené {formatUsd(plan.deployedUsd)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleWhy}
        aria-expanded={whyOpen}
        className="mt-4 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs font-semibold text-zinc-200"
      >
        Prečo táto alokácia?
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 transition ${whyOpen ? "rotate-180" : ""}`}
        />
      </button>
      {whyOpen && (
        <ul className="mt-2 space-y-1.5 px-1 text-[11px] leading-relaxed text-zinc-400">
          {plan.narrative.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
