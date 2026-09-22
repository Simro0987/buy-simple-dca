"use client";

import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { QUICK_AMOUNTS } from "@/lib/dcaEngineConfig";
import { glassInset, glassPanel } from "@/lib/dca/glass";
import { formatUsd } from "@/lib/data";
import { interactiveButton } from "@/lib/motion";

interface WeeklyInvestmentCardProps {
  value: number;
  onChange: (value: number) => void;
  lmt2MinUsd: number;
  onLmt2MinUsd: (value: number) => void;
}

const STEP_AMOUNT = 50;

export function WeeklyInvestmentCard({
  value,
  onChange,
  lmt2MinUsd,
  onLmt2MinUsd,
}: WeeklyInvestmentCardProps) {
  const inputId = useId();
  const minId = useId();
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
      className={`${glassPanel} p-5`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Týždenná investícia
          </p>
          <label htmlFor={inputId} className="mt-1 block text-sm text-zinc-300">
            Suma na DCA (USD)
          </label>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() =>
              onChange(Math.max(0, Math.round((value - STEP_AMOUNT) * 100) / 100))
            }
            {...interactiveButton}
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-300"
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
              onChange={(event) =>
                setDraft(event.target.value.replace(/[^\d.,]/g, ""))
              }
              onBlur={() => commitDraft(draft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder="431"
              className="w-full rounded-2xl border border-white/10 bg-black/40 py-4 pl-10 pr-4 text-3xl font-bold tracking-tight text-white outline-none backdrop-blur-md transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/25"
            />
          </div>

          <motion.button
            type="button"
            onClick={() => onChange(Math.round((value + STEP_AMOUNT) * 100) / 100)}
            {...interactiveButton}
            className="flex h-14 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-300"
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
                    ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                    : `${glassInset} text-zinc-400`
                }`}
              >
                {formatUsd(amount)}
              </motion.button>
            );
          })}
        </div>

        <div>
          <label htmlFor={minId} className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Min. LMT2 (USD)
          </label>
          <input
            id={minId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={String(lmt2MinUsd)}
            onChange={(event) => {
              const parsed = Number(event.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
              if (Number.isFinite(parsed)) onLmt2MinUsd(Math.max(0, parsed));
              else if (event.target.value.trim() === "") onLmt2MinUsd(0);
            }}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-amber-400/40"
          />
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
            Ak by LMT2 klesol pod túto sumu, rebrík ho preskočí a 100 % LMT ide do LMT1.
          </p>
        </div>
      </div>
    </motion.section>
  );
}
