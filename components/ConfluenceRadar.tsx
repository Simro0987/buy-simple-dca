"use client";

import { motion } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { confluenceMetrics } from "@/lib/confluenceData";

export function ConfluenceRadar() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-emerald-400/8 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
              Confluence Octagon
            </p>
            <h2 className="mt-1 text-base font-bold text-white">
              Makro akumulácia
            </h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Live
            </span>
          </span>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={confluenceMetrics}>
              <PolarGrid
                stroke="#27272a"
                radialLines={false}
              />
              <PolarAngleAxis
                dataKey="subject"
                tick={{
                  fill: "#71717a",
                  fontSize: 10,
                  fontWeight: 500,
                }}
              />
              <Radar
                name="Confluence"
                dataKey="value"
                stroke="#34d399"
                strokeWidth={2.5}
                fill="#34d399"
                fillOpacity={0.2}
                dot={{
                  r: 3,
                  fill: "#34d399",
                  stroke: "#050505",
                  strokeWidth: 1.5,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {confluenceMetrics.map((metric) => (
            <div
              key={metric.subject}
              className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {metric.shortLabel}
              </p>
              <p className="mt-0.5 text-sm font-bold text-emerald-400">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
