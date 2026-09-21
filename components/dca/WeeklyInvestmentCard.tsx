"use client";

import { motion } from "framer-motion";
import { Anchor, Minus, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  ANCHOR_SPLIT,
  QUICK_AMOUNTS,
  TOKEN_SPLIT_COLORS,
  type TokenExecutionPlan,
} from "@/lib/dcaEngineConfig";
import { formatUsd } from "@/lib/data";
import { interactiveButton } from "@/lib/motion";

interface WeeklyInvestmentCardProps {
  value: number;
  onChange: (value: number) => void;
  plans: TokenExecutionPlan[];
}

const STEP_AMOUNT = 50;

export function WeeklyInvestmentCard({
  value,
  onChange,
  plans,
}: WeeklyInvestmentCardProps) {
  const inputId = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    setDraft(value > 0 ? String(value) : "");
  }, [value]);

  const commitDraft = (raw: string) => {
    const normalized = raw.replace(",", ".").trim();
    if (normalized === "") {
      onChange(0);
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(value > 0 ? String(value) : "");
      return;
    }
    onChange(Math.max(0, Math.round(parsed * 100) / 100));
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Weekly Investment
          </p>
          <label
            htmlFor={inputId}
            className="mt-1 block text-sm text-zinc-400"
          >
            Týždenná suma na DCA (USD)
          </label>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => onChange(Math.max(0, Math.round((value - STEP_AMOUNT) * 100) / 100))}
            {...interactiveButton}
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-white"
            aria-label={`Znížiť o ${STEP_AMOUNT} dolárov`}
          >
            <Minus className="h-4 w-4" />
          </motion.button>

          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-zinc-500">
              $
            </span>
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-describedby={hintId}
              value={draft}
              onChange={(event) => {
                const next = event.target.value.replace(/[^\d.,]/g, "");
                setDraft(next);
              }}
              onBlur={() => commitDraft(draft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              placeholder="0"
              className="w-full rounded-2xl border border-white/10 bg-black/50 py-4 pl-10 pr-4 text-3xl font-bold tracking-tight text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>

          <motion.button
            type="button"
            onClick={() => onChange(Math.round((value + STEP_AMOUNT) * 100) / 100)}
            {...interactiveButton}
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-white"
            aria-label={`Zvýšiť o ${STEP_AMOUNT} dolárov`}
          >
            <Plus className="h-4 w-4" />
          </motion.button>
        </div>

        <p id={hintId} className="text-[11px] leading-relaxed text-zinc-500">
          Suma sa automaticky rozdelí podľa Anchor Split. Môžeš ju kedykoľvek
          zmeniť — uloží sa v tomto zariadení.
        </p>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Rýchle sumy">
          {QUICK_AMOUNTS.map((amount) => {
            const isActive = value === amount;
            return (
              <motion.button
                key={amount}
                type="button"
                onClick={() => onChange(amount)}
                aria-pressed={isActive}
                {...interactiveButton}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                }`}
              >
                {formatUsd(amount)}
              </motion.button>
            );
          })}
        </div>

        <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2">
              <Anchor className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Anchor Split
              </span>
            </div>
            <span className="text-[11px] font-bold text-white">
              BTC {ANCHOR_SPLIT.BTC}% · ETH {ANCHOR_SPLIT.ETH}% · SOL{" "}
              {ANCHOR_SPLIT.SOL}%
            </span>
          </div>

          {value > 0 ? (
            <>
              <div
                className="flex h-2.5 overflow-hidden rounded-full bg-zinc-800/80"
                role="img"
                aria-label={`Alokácia BTC ${ANCHOR_SPLIT.BTC} percent, ETH ${ANCHOR_SPLIT.ETH} percent, SOL ${ANCHOR_SPLIT.SOL} percent`}
              >
                {plans.map((plan) => (
                  <div
                    key={plan.symbol}
                    className="h-full"
                    style={{
                      width: `${plan.weightPercent}%`,
                      backgroundColor: TOKEN_SPLIT_COLORS[plan.symbol],
                    }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {plans.map((plan) => (
                  <div key={plan.symbol} className="min-w-0 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      {plan.symbol}
                    </p>
                    <p className="truncate text-xs font-bold text-white">
                      {formatUsd(plan.totalUsd)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-xs text-zinc-500">
              Zadaj sumu a uvidíš, koľko ide do BTC, ETH a SOL.
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}
