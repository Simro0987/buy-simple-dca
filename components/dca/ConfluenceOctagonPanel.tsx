"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { ConfluenceMetric } from "@/lib/confluenceOctagon";
import { listContainerVariants, listItemVariants } from "@/lib/motion";

const tokenSwitchTransition = {
  duration: 0.45,
  ease: [0.4, 0, 0.2, 1] as const,
};

interface TokenOctagonChipsProps {
  tokens: Array<{ symbol: string }>;
  selectedToken: string;
  onSelect: (symbol: string) => void;
  scores?: Record<string, number | undefined>;
  accent?: "emerald" | "blue";
}

export function TokenOctagonChips({
  tokens,
  selectedToken,
  onSelect,
  scores,
  accent = "emerald",
}: TokenOctagonChipsProps) {
  const activeClass =
    accent === "blue"
      ? "bg-blue-400/15 text-blue-300 ring-1 ring-blue-400/30"
      : "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30";

  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.map((token) => {
        const active = token.symbol === selectedToken;
        const score = scores?.[token.symbol];
        return (
          <button
            key={token.symbol}
            type="button"
            onClick={() => onSelect(token.symbol)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-all duration-300 ease-in-out ${
              active
                ? activeClass
                : "bg-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
            }`}
          >
            {token.symbol}
            {score != null ? (
              <span className="ml-1 tabular-nums text-[9px] opacity-80">{score}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

interface ConfluenceOctagonPanelProps {
  selectedToken: string;
  metrics: ConfluenceMetric[];
  accumulationScore: number;
  loading?: boolean;
  compact?: boolean;
}

export function ConfluenceOctagonPanel({
  selectedToken,
  metrics,
  accumulationScore,
  loading = false,
  compact = false,
}: ConfluenceOctagonPanelProps) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <AnimatePresence mode="wait">
        <motion.p
          key={`score-${selectedToken}-${accumulationScore}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={tokenSwitchTransition}
          className="text-[10px] font-semibold tabular-nums text-emerald-300"
        >
          Skóre akumulácie {loading && metrics.length === 0 ? "—" : `${accumulationScore}/100`}
        </motion.p>
      </AnimatePresence>

      <div className={compact ? "h-56 w-full" : "h-72 w-full"}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`radar-${selectedToken}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={tokenSwitchTransition}
            className="h-full w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="72%" data={metrics}>
                <PolarGrid stroke="#27272a" radialLines={false} />
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
                  isAnimationActive
                  animationDuration={500}
                  animationEasing="ease-out"
                  dot={{
                    r: 3,
                    fill: "#34d399",
                    stroke: "#050505",
                    strokeWidth: 1.5,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`metrics-${selectedToken}`}
          variants={listContainerVariants}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, y: -6 }}
          transition={tokenSwitchTransition}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {metrics.map((metric) => (
            <motion.div
              key={`${selectedToken}-${metric.subject}`}
              variants={listItemVariants}
              layout
              className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 transition-colors duration-300"
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {metric.shortLabel}
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-400 transition-all duration-500 ease-in-out">
                {metric.value}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
