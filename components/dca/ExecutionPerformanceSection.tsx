"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ConfluenceOctagonPanel,
  TokenOctagonChips,
} from "@/components/dca/ConfluenceOctagonPanel";
import { useConfluenceOctagon } from "@/hooks/useConfluenceOctagon";
import { useTokenExecutionAdvisor } from "@/hooks/useTokenExecutionAdvisor";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { Transaction, TrackedAsset } from "@/lib/portfolioStorage";
import {
  formatMultiplier,
  formatPct,
  formatSignedPct,
} from "@/lib/numberFormat";
import { isSignificantApyPct } from "@/lib/yieldDataSources";

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-300",
  B: "text-teal-300",
  C: "text-amber-300",
  D: "text-orange-300",
  E: "text-rose-300",
  F: "text-rose-400",
};

const tokenSwitchTransition = {
  duration: 0.45,
  ease: [0.4, 0, 0.2, 1] as const,
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
    scoresBySymbol,
    tokenSwitchLoading,
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
  const metrics = activeSnapshot?.metrics ?? [];

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
            Confluence Octagon & Active Advisor
          </p>
          <AnimatePresence mode="wait">
            <motion.h3
              key={`title-${selectedToken}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={tokenSwitchTransition}
              className="mt-1 text-base font-bold text-white"
            >
              {selectedToken} · {advisor.name}
            </motion.h3>
          </AnimatePresence>
          <p className="mt-1 text-[10px] text-zinc-500">
            Prepojené s portfóliom a históriou exekúcií
            {usingPortfolioTokens ? " · tokeny z Portfólia" : " · predvolený kôš"}
          </p>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={`score-badge-${selectedToken}-${advisor.accumulationScore}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={tokenSwitchTransition}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right"
          >
            <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
              Oktágon
            </p>
            <p className="text-lg font-bold tabular-nums text-emerald-300">
              {tokenSwitchLoading ? "—" : `${advisor.accumulationScore}/100`}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mb-4">
        <TokenOctagonChips
          tokens={tokens}
          selectedToken={selectedToken}
          onSelect={setSelectedToken}
          scores={scoresBySymbol}
          accent="blue"
        />
      </div>

      <ConfluenceOctagonPanel
        selectedToken={selectedToken}
        metrics={metrics}
        accumulationScore={advisor.accumulationScore}
        loading={tokenSwitchLoading}
        compact
      />

      <div className="my-5 h-px bg-white/5" />

      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
        Execution Performance
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={`advisor-metrics-${selectedToken}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={tokenSwitchTransition}
          className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <MetricTile
            label="Alpha vs Market"
            value={formatSignedPct(advisor.alphaVsMarketPct, 1)}
            tone={advisor.alphaVsMarketPct >= 0 ? "positive" : "negative"}
          />
          <MetricTile
            label="7D Market DCA"
            value={formatSignedPct(advisor.marketDcaBaselinePct, 1)}
            tone="neutral"
          />
          <MetricTile
            label="Ø Reward"
            value={formatSignedPct(advisor.rewardScore, 1)}
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
        </motion.div>
      </AnimatePresence>

      {advisor.yieldSatelliteMetrics &&
        (advisor.category === "yield" || advisor.category === "satellite") && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`yield-metrics-${selectedToken}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={tokenSwitchTransition}
              className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {isSignificantApyPct(advisor.yieldSatelliteMetrics.apyPct) ? (
                <MetricTile
                  label="APY výnos"
                  value={formatPct(advisor.yieldSatelliteMetrics.apyPct, 1)}
                  sublabel={
                    advisor.yieldSatelliteMetrics.apyIsEstimated
                      ? advisor.yieldSatelliteMetrics.apySourceLabel
                      : `Live · ${advisor.yieldSatelliteMetrics.apySourceLabel}`
                  }
                  tone="positive"
                />
              ) : null}
              <MetricTile
                label="IL Risk / Reward"
                value={formatMultiplier(advisor.yieldSatelliteMetrics.ilRiskRewardRatio, 1)}
                tone="neutral"
              />
              <MetricTile
                label="Staking Multiplier"
                value={formatMultiplier(advisor.yieldSatelliteMetrics.stakingYieldMultiplier, 2)}
                tone="positive"
              />
              <MetricTile
                label="Limitný pás"
                value={`${formatMultiplier(advisor.yieldSatelliteMetrics.atrLimitMultiplier, 1)}ATR`}
                tone="neutral"
              />
            </motion.div>
          </AnimatePresence>
        )}

      <AnimatePresence mode="wait">
        <motion.div
          key={`advice-${selectedToken}-${advisor.activeAdvice}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={tokenSwitchTransition}
          className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Active Advisor
          </p>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-emerald-100/90">
            {tokenSwitchLoading
              ? "Načítavam token-špecifický oktágon…"
              : advisor.activeAdvice}
          </p>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {advisor.learnedPatterns.length > 0 ? (
          <motion.div
            key={`patterns-${selectedToken}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={tokenSwitchTransition}
            className="space-y-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Naučené vzory ·{" "}
              {advisor.preferredRoute === "market" ? "Market bias" : "Limit bias"}
            </p>
            {advisor.learnedPatterns.map((pattern) => (
              <p
                key={`${selectedToken}-${pattern}`}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-zinc-400"
              >
                {pattern}
              </p>
            ))}
          </motion.div>
        ) : (
          <motion.p
            key={`patterns-empty-${selectedToken}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-zinc-500"
          >
            {selectedToken}: žiadne naučené vzory — spustite prvú exekúciu pre
            self-learning loop.
          </motion.p>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function MetricTile({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : "text-white";

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors duration-300">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sublabel ? (
        <p className="mt-0.5 text-[8px] font-medium text-zinc-500">{sublabel}</p>
      ) : null}
    </div>
  );
}
