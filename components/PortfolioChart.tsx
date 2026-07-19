"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUsd } from "@/lib/data";
import {
  generatePortfolioHistoryForTimeframe,
  TIMEFRAME_LABELS,
  type ChartTimeframe,
  type PortfolioHistoryPoint,
} from "@/lib/chartData";
import type { Transaction } from "@/lib/portfolioStorage";

const TIMEFRAMES: ChartTimeframe[] = ["24h", "7d", "30d", "3m", "1y", "ALL"];

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: PortfolioHistoryPoint }[];
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 px-4 py-3 shadow-xl backdrop-blur-md">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {point.label}
      </p>
      <p className="mt-0.5 text-lg font-bold tracking-tight text-emerald-400">
        {formatUsd(point.value)}
      </p>
    </div>
  );
}

interface PortfolioChartProps {
  endValue?: number;
  transactions?: Transaction[];
  loading?: boolean;
}

export function PortfolioChart({
  endValue = 0,
  transactions = [],
  loading = false,
}: PortfolioChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("30d");

  const chartData = useMemo(
    () =>
      generatePortfolioHistoryForTimeframe(
        transactions,
        endValue,
        timeframe,
      ),
    [endValue, timeframe, transactions],
  );

  const percentChange = useMemo(() => {
    const start = chartData[0]?.value ?? endValue;
    if (!start && !endValue) return 0;
    if (!start) return 0;
    return ((endValue - start) / start) * 100;
  }, [chartData, endValue]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            VÝVOJ HODNOTY
          </p>
          <p className="text-sm font-medium text-zinc-400">
            {TIMEFRAME_LABELS[timeframe]} vývoj portfólia
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
          {loading ? (
            <PriceSkeleton className="inline-block h-3 w-12" />
          ) : (
            `${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(1)}%`
          )}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TIMEFRAMES.map((tf) => {
          const active = timeframe === tf;
          return (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${
                active
                  ? "border border-white/30 bg-zinc-800 text-white"
                  : "border border-transparent bg-zinc-900 text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
              }`}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          );
        })}
      </div>

      <div className="relative h-48 w-full">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#111113]/60 backdrop-blur-[1px]">
            <PriceSkeleton className="h-40 w-full rounded-2xl" />
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
          >
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                <stop offset="60%" stopColor="#10B981" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#000000" stopOpacity={0} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                stroke: "rgba(16, 185, 129, 0.25)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke="#10B981"
              strokeWidth={2.5}
              fill="url(#portfolioGradient)"
              filter="url(#glow)"
              dot={false}
              activeDot={{
                r: 5,
                fill: "#10B981",
                stroke: "#050505",
                strokeWidth: 2,
                className: "drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  );
}
