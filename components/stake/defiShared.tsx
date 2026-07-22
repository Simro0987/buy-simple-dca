"use client";

import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { interactiveCard } from "@/lib/motion";
import { formatPct } from "@/lib/numberFormat";

export type DefiTokenTab = "ETH" | "SOL" | "LINK";

const ACTIVE_TAB_COLOR = "#8B5CF6";

export function DefiTokenSelector({
  active,
  onChange,
}: {
  active: DefiTokenTab;
  onChange: (tab: DefiTokenTab) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/5 bg-[#111113] p-1.5">
      {(["ETH", "SOL", "LINK"] as const).map((token) => {
        const isActive = active === token;
        return (
          <button
            key={token}
            type="button"
            onClick={() => onChange(token)}
            className={`min-w-[88px] rounded-xl px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
              isActive
                ? "text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            style={
              isActive
                ? {
                    backgroundColor: `${ACTIVE_TAB_COLOR}22`,
                    border: `1px solid ${ACTIVE_TAB_COLOR}66`,
                    color: ACTIVE_TAB_COLOR,
                  }
                : { border: "1px solid transparent" }
            }
          >
            {token}
          </button>
        );
      })}
    </div>
  );
}

export function RiskBadge({ level }: { level: "low" | "medium" | "elevated" }) {
  const styles =
    level === "elevated"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : level === "medium"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";

  const label =
    level === "elevated" ? "Risk Info" : level === "medium" ? "Stredné" : "Nízke";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${styles}`}
    >
      <Shield className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

export function LayerShell({
  layer,
  title,
  subtitle,
  accent,
  children,
}: {
  layer: string;
  title: string;
  subtitle: string;
  accent: "violet" | "emerald" | "amber";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "violet"
      ? "from-violet-500/20 to-purple-500/5 border-violet-500/20"
      : accent === "amber"
        ? "from-amber-500/15 to-orange-500/5 border-amber-500/20"
        : "from-emerald-500/20 to-teal-500/5 border-emerald-500/20";

  return (
    <motion.section
      {...interactiveCard}
      className={`overflow-hidden rounded-3xl border bg-gradient-to-br ${accentClass} bg-[#111113] p-4`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {layer}
          </p>
          <h3 className="mt-0.5 text-sm font-bold text-white">{title}</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

export function MetricTile({
  label,
  value,
  sub,
  accent = "white",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "white" | "emerald" | "violet";
}) {
  const tone =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "violet"
        ? "text-violet-300"
        : "text-white";

  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2.5">
      <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${tone}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[9px] text-zinc-600">{sub}</p> : null}
    </div>
  );
}

export function DefiRouteRow({
  label,
  recommended,
  detailLine,
  effectiveApyPct,
  selected,
  onSelect,
}: {
  label: string;
  recommended?: boolean;
  detailLine: string;
  effectiveApyPct: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-violet-500/40 bg-violet-500/10"
          : "border-white/5 bg-white/[0.02] hover:border-violet-500/20"
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold text-white">{label}</p>
          {recommended ? (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-emerald-300">
              Best
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[9px] text-zinc-500">{detailLine}</p>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold tabular-nums text-violet-300">
          {formatPct(effectiveApyPct, 2)}
        </p>
        <p className="text-[8px] text-zinc-600">eff. APY</p>
      </div>
    </button>
  );
}

export function DefiLoadingState() {
  return (
    <div className="rounded-3xl border border-white/5 bg-[#111113] p-6 text-center text-sm text-zinc-500">
      Načítavam DeFi Mozog…
    </div>
  );
}
