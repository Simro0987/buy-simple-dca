"use client";

import { motion } from "framer-motion";
import { useConfluenceOctagon } from "@/hooks/useConfluenceOctagon";
import { useTokenExecutionAdvisor } from "@/hooks/useTokenExecutionAdvisor";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { Transaction, TrackedAsset } from "@/lib/portfolioStorage";

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-300",
  B: "text-teal-300",
  C: "text-amber-300",
  D: "text-orange-300",
  E: "text-rose-300",
  F: "text-rose-400",
};

interface ExecutionPerformanceSectionProps {
  fearGreed: number;
  portfolioSymbols?: string[];
  trackedAssets?: TrackedAsset[];
  dcaTransactions: Transaction[];
  executionPlans: TokenExecutionPlan[];
  tokenPrices: Record<string, number>;
}

export function ExecutionPerformanceSection({
  fearGreed,
  portfolioSymbols,
  trackedAssets,
  dcaTransactions,
  executionPlans,
  tokenPrices,
}: ExecutionPerformanceSectionProps) {
  const {
    tokens,
    selectedToken,
    setSelectedToken,
    activeSnapshot,
    snapshots,
    loading,
    usingPortfolioTokens,
  } = useConfluenceOctagon(fearGreed, portfolioSymbols, trackedAssets);

  const advisor = useTokenExecutionAdvisor({
    symbol: selectedToken,
    octagon: activeSnapshot,
    dcaTransactions,
    executionPlans,
    tokenPrices,
  });

  const gradeClass =
    GRADE_COLORS[advisor.efficiencyGrade] ?? "text-zinc-300";

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="overflow-hidden rounded-3xl border border-white/5 bg-[#111113] p-5"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Execution Performance
          </p>
          <h3 className="mt-1 text-base font-bold text-white">
            Active Advisor · {selectedToken}
          </h3>
          <p className="mt-1 text-[10px] text-zinc-500">
            Prepojené s Confluence Octagon a históriou exekúcií
            {usingPortfolioTokens ? " · tokeny z Portfólia" : " · predvolený kôš"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            Oktágon
          </p>
          <p className="text-lg font-bold tabular-nums text-emerald-300">
            {advisor.accumulationScore}/100
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {tokens.map((token) => {
          const active = token.symbol === selectedToken;
          const score = snapshots[token.symbol]?.accumulationScore;
          return (
            <button
              key={token.symbol}
              type="button"
              onClick={() => setSelectedToken(token.symbol)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                active
                  ? "bg-blue-400/15 text-blue-300 ring-1 ring-blue-400/30"
                  : "bg-white/5 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {token.symbol}
              {score != null ? (
                <span className="ml-1 tabular-nums text-[9px] opacity-80">
                  {score}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile
          label="Alpha vs Market"
          value={`${advisor.alphaVsMarketPct >= 0 ? "+" : ""}${advisor.alphaVsMarketPct.toFixed(1)} %`}
          tone={advisor.alphaVsMarketPct >= 0 ? "positive" : "negative"}
        />
        <MetricTile
          label="7D Market DCA"
          value={`${advisor.marketDcaBaselinePct >= 0 ? "+" : ""}${advisor.marketDcaBaselinePct.toFixed(1)} %`}
          tone="neutral"
        />
        <MetricTile
          label="Ø Reward"
          value={`${advisor.rewardScore >= 0 ? "+" : ""}${advisor.rewardScore.toFixed(1)}`}
          tone={advisor.rewardScore >= 0 ? "positive" : "negative"}
        />
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            Efficiency Grade
          </p>
          <p className={`mt-1 text-xl font-black ${gradeClass}`}>
            {advisor.efficiencyGrade}
          </p>
          <p className="text-[9px] text-zinc-600">
            z {advisor.previousGrade} · n={advisor.weeklyCount} týž.
          </p>
        </div>
      </div>

      <motion.div
        key={advisor.activeAdvice}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3"
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
          Active Advisor
        </p>
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-emerald-100/90">
          {loading ? "Načítavam token-špecifický oktágon…" : advisor.activeAdvice}
        </p>
      </motion.div>

      {advisor.learnedPatterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Naučené vzory · {advisor.preferredRoute === "market" ? "Market bias" : "Limit bias"}
          </p>
          {advisor.learnedPatterns.map((pattern) => (
            <p
              key={pattern}
              className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-zinc-400"
            >
              {pattern}
            </p>
          ))}
        </div>
      )}
    </motion.section>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : "text-white";

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
