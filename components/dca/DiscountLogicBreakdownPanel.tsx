"use client";

import { formatDecimal } from "@/lib/numberFormat";
import {
  TOKEN_MIN_FLOOR_ATR_FRACTION,
  type DiscountLogicBreakdown,
} from "@/lib/minDiscountBuffer";
import { buildSmoothBlendNarrative } from "@/lib/smartTargetSelector";

interface DiscountLogicBreakdownPanelProps {
  breakdown: DiscountLogicBreakdown;
}

function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[10px]">
      <span className="text-zinc-500">{label}</span>
      <div className="text-right">
        <span className="font-semibold tabular-nums text-zinc-200">{value}</span>
        {hint ? (
          <p className="mt-0.5 text-[9px] font-medium text-zinc-600">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function DiscountLogicBreakdownPanel({
  breakdown,
}: DiscountLogicBreakdownPanelProps) {
  const atr = formatDecimal(breakdown.atr14dPct, 1);
  const multiplier = formatDecimal(breakdown.trendMultiplier, 2);
  const dynamicNoise = formatDecimal(breakdown.dynamicNoisePct, 1);
  const atrScaledMin = formatDecimal(breakdown.atrScaledMinPct, 1);
  const tokenMinFloor = formatDecimal(breakdown.tokenMinFloorPct, 1);
  const s1Distance = formatDecimal(breakdown.s1DistancePct, 1);
  const atrHalf = formatDecimal(TOKEN_MIN_FLOOR_ATR_FRACTION, 1);
  const blend = breakdown.smoothBlend;

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-300/90">
        Logika výpočtu zľavy · {breakdown.symbol}
      </p>
      <div className="mt-2 space-y-2">
        <MetricRow label="Denná volatilita (ATR)" value={`${atr} %`} />
        <MetricRow
          label="Trendový násobiteľ"
          value={`${multiplier} (${breakdown.trendMultiplierLabel})`}
        />
        <MetricRow
          label="Dynamický šum"
          value={`${dynamicNoise} %`}
          hint={`${atr} % × ${multiplier}`}
        />
        <MetricRow
          label="ATR minimum (0,5×ATR)"
          value={`${atrScaledMin} %`}
          hint={`${atr} % × ${atrHalf}`}
        />
        <MetricRow
          label="Token min floor"
          value={`${tokenMinFloor} %`}
          hint={`max(${dynamicNoise} %, ${atrScaledMin} %)`}
        />
        {blend ? (
          <>
            <MetricRow
              label="Vzdialenosť S1"
              value={`${s1Distance} %`}
              hint={`váha S1 = min(1, S1 / ${tokenMinFloor})`}
            />
            <MetricRow
              label="Hlboký cieľ"
              value={`${formatDecimal(blend.deepTargetPct, 1)} %`}
              hint={
                blend.deepTargetSource === "panic_wick"
                  ? "Panický knot"
                  : blend.deepTargetSource === "s2"
                    ? "S2"
                    : "S1 fallback"
              }
            />
            <MetricRow
              label="Finálna zľava"
              value={`${formatDecimal(blend.finalDiscountPct, 1)} %`}
              hint="plynulý blend S1 + hlboký cieľ"
            />
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-2 text-[10px] font-medium leading-relaxed text-cyan-100">
              Váha zľavy:{" "}
              <span className="font-bold tabular-nums">
                {blend.s1WeightPct} % S1
              </span>{" "}
              +{" "}
              <span className="font-bold tabular-nums">
                {blend.deepWeightPct} % Hlboký cieľ
              </span>{" "}
              <span className="text-cyan-200/80">(Plynulý prechod)</span>
            </div>
            {blend.s1Weight < 0.999 ? (
              <div className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2.5 py-2 text-[10px] font-medium leading-relaxed text-violet-100">
                {buildSmoothBlendNarrative(blend)}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
