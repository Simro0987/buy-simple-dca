"use client";

import { motion } from "framer-motion";
import { Minus, Plus, Zap } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { QUICK_AMOUNTS } from "@/lib/dcaEngineConfig";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import { interactiveButton } from "@/lib/motion";

interface WeeklyInvestmentCardProps {
  value: number;
  onChange: (value: number) => void;
  moneyMode: boolean;
  onToggleMoneyMode: () => void;
}

const STEP_AMOUNT = 50;

export function WeeklyInvestmentCard({
  value,
  onChange,
  moneyMode,
  onToggleMoneyMode,
}: WeeklyInvestmentCardProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    setDraft(value > 0 ? String(value) : "");
  }, [value]);

  const commit = (raw: string) => {
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
      className={`${glassPanel} p-5`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/12 blur-3xl" />
      <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-amber-500/8 blur-3xl" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Týždenná investícia
            </p>
            <label htmlFor={inputId} className="mt-1 block text-sm text-zinc-300">
              Suma na DCA (USD)
            </label>
          </div>
          <motion.button
            type="button"
            role="switch"
            aria-checked={moneyMode}
            onClick={onToggleMoneyMode}
            {...interactiveButton}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
              moneyMode
                ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.28)]"
                : "border-white/10 bg-zinc-800/80 text-zinc-400"
            }`}
          >
            <Zap
              className={`h-3.5 w-3.5 ${moneyMode ? "fill-emerald-400 text-emerald-400" : ""}`}
              aria-hidden="true"
            />
            Money Mode
          </motion.button>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() =>
              onChange(Math.max(0, Math.round((value - STEP_AMOUNT) * 100) / 100))
            }
            {...interactiveButton}
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-700 text-zinc-200 shadow-inner"
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
              value={draft}
              onChange={(event) => {
                const next = event.target.value.replace(/[^\d.,]/g, "");
                setDraft(next);
                const parsed = Number(next.replace(",", "."));
                if (next !== "" && Number.isFinite(parsed) && parsed >= 0) {
                  onChange(Math.round(parsed * 100) / 100);
                }
              }}
              onBlur={() => commit(draft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder="431"
              className="w-full rounded-2xl border border-white/15 bg-gradient-to-br from-white/10 via-black/40 to-zinc-950/80 py-4 pl-10 pr-4 text-3xl font-bold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.35)] outline-none backdrop-blur-md transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/25"
            />
          </div>

          <motion.button
            type="button"
            onClick={() => onChange(Math.round((value + STEP_AMOUNT) * 100) / 100)}
            {...interactiveButton}
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-700 text-zinc-200 shadow-inner"
            aria-label={`Zvýšiť o ${STEP_AMOUNT} dolárov`}
          >
            <Plus className="h-4 w-4" />
          </motion.button>
        </div>

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
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  isActive
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)]"
                    : `${glassInset} text-zinc-400`
                }`}
              >
                {`$${amount.toLocaleString("en-US")}`}
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
