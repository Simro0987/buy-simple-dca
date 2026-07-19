"use client";

import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PriceSkeleton } from "@/components/ui/PriceSkeleton";
import { formatUsd } from "@/lib/data";

interface PortfolioDonutChartProps {
  coreTotal: number;
  yieldTotal: number;
  loading?: boolean;
}

const COLORS = {
  core: "#34d399",
  yield: "#a855f7",
};

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { percent: number } }[];
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0];

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/90 px-4 py-3 shadow-xl backdrop-blur-md">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {item.name}
      </p>
      <p className="mt-0.5 text-lg font-bold text-white">
        {formatUsd(item.value)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {item.payload.percent.toFixed(1)}%
      </p>
    </div>
  );
}

export function PortfolioDonutChart({
  coreTotal,
  yieldTotal,
  loading = false,
}: PortfolioDonutChartProps) {
  const total = coreTotal + yieldTotal;
  const data = [
    {
      name: "Core",
      value: coreTotal,
      percent: total > 0 ? (coreTotal / total) * 100 : 0,
      color: COLORS.core,
    },
    {
      name: "Yield",
      value: yieldTotal,
      percent: total > 0 ? (yieldTotal / total) * 100 : 0,
      color: COLORS.yield,
    },
  ].filter((item) => item.value > 0 || total === 0);

  if (total === 0) {
    data.push(
      {
        name: "Core",
        value: 1,
        percent: 50,
        color: COLORS.core,
      },
      {
        name: "Yield",
        value: 1,
        percent: 50,
        color: COLORS.yield,
      },
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.04, ease: "easeOut" }}
      className="rounded-3xl border border-white/5 bg-[#111113] p-4"
    >
      <div className="mb-3 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
          Alokácia
        </p>
        <p className="text-sm font-medium text-zinc-400">Core vs Yield</p>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-4">
        <div className="relative h-40 w-full">
          {loading ? (
            <PriceSkeleton className="h-40 w-full rounded-2xl" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<DonutTooltip />} />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-3 pr-1">
          {[
            { label: "Core", value: coreTotal, color: COLORS.core },
            { label: "Yield", value: yieldTotal, color: COLORS.yield },
          ].map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs font-medium text-zinc-400">
                  {item.label}
                </span>
              </div>
              <p className="text-sm font-semibold text-white">
                {loading ? (
                  <PriceSkeleton className="h-4 w-16" />
                ) : (
                  formatUsd(item.value)
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
