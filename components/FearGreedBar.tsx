"use client";

interface FearGreedBarProps {
  value: number;
  label: string;
}

export function FearGreedBar({ value, label }: FearGreedBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Fear & Greed Index
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {value}
            <span className="text-base font-normal text-zinc-500">/100</span>
          </p>
        </div>
        <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
          {label}
        </span>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400"
          style={{ width: "100%" }}
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-zinc-900 shadow-[0_0_12px_rgba(255,255,255,0.4)]"
          style={{ left: `calc(${value}% - 8px)` }}
        />
      </div>

      <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-zinc-600">
        <span>Extreme Fear</span>
        <span>Neutral</span>
        <span>Extreme Greed</span>
      </div>
    </div>
  );
}
