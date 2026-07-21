"use client";

import { useMemo } from "react";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { AssetCategory } from "@/lib/portfolioStorage";
import { getCategoryStyles } from "@/lib/assetStyles";

export type DcaTokenFilter =
  | "all"
  | AssetCategory
  | { symbol: string };

interface DcaTokenFilterBarProps {
  orders: TokenExecutionPlan[];
  activeFilter: DcaTokenFilter;
  onFilterChange: (filter: DcaTokenFilter) => void;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  core: "Core",
  satellite: "Satellite",
  yield: "Yield",
};

function isSameFilter(a: DcaTokenFilter, b: DcaTokenFilter): boolean {
  if (typeof a === "object" && typeof b === "object") {
    return a.symbol === b.symbol;
  }
  return a === b;
}

function FilterChip({
  label,
  active,
  onClick,
  accentColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accentColor?: string;
}) {
  const activeStyle = accentColor
    ? {
        borderColor: `${accentColor}66`,
        backgroundColor: `${accentColor}1A`,
        color: accentColor,
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-200 ${
        active
          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200"
      }`}
      style={active && accentColor ? activeStyle : undefined}
    >
      {label}
    </button>
  );
}

export function filterExecutionOrders(
  orders: TokenExecutionPlan[],
  filter: DcaTokenFilter,
): TokenExecutionPlan[] {
  if (filter === "all") return orders;
  if (typeof filter === "object") {
    return orders.filter((order) => order.symbol === filter.symbol);
  }
  return orders.filter((order) => order.category === filter);
}

export function DcaTokenFilterBar({
  orders,
  activeFilter,
  onFilterChange,
}: DcaTokenFilterBarProps) {
  const categories = useMemo(() => {
    const present = new Set<AssetCategory>();
    for (const order of orders) {
      present.add(order.category);
    }
    return (["core", "satellite", "yield"] as const).filter((category) =>
      present.has(category),
    );
  }, [orders]);

  const tokens = useMemo(
    () =>
      [...orders].sort((a, b) => {
        if (b.weightPercent !== a.weightPercent) {
          return b.weightPercent - a.weightPercent;
        }
        return a.symbol.localeCompare(b.symbol);
      }),
    [orders],
  );

  if (orders.length === 0) return null;

  return (
    <div className="relative">
      <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="flex w-max min-w-full gap-2 px-1">
          <FilterChip
            label="Všetky"
            active={activeFilter === "all"}
            onClick={() => onFilterChange("all")}
          />

          {categories.map((category) => {
            const styles = getCategoryStyles(category);
            return (
              <FilterChip
                key={category}
                label={CATEGORY_LABELS[category]}
                active={activeFilter === category}
                accentColor={styles.color}
                onClick={() => onFilterChange(category)}
              />
            );
          })}

          <span
            className="mx-0.5 w-px shrink-0 self-stretch bg-white/10"
            aria-hidden
          />

          {tokens.map((order) => {
            const styles = getCategoryStyles(order.category);
            const tokenFilter: DcaTokenFilter = { symbol: order.symbol };
            return (
              <FilterChip
                key={order.symbol}
                label={order.symbol}
                active={isSameFilter(activeFilter, tokenFilter)}
                accentColor={styles.color}
                onClick={() => onFilterChange(tokenFilter)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
