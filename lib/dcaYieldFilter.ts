import { DCA_YIELD_TOKENS } from "@/lib/dcaMarketData";

export const YIELD_FILTER_THRESHOLDS = {
  rsiMax: 50,
  sma14FloorPct: -10,
  fundamentalMin: 50,
  weightExponent: 2.5,
} as const;

export type YieldFilterId = "rsi" | "sma14" | "fundamental";

export interface YieldFilterCondition {
  id: YieldFilterId;
  passed: boolean;
  detail: string;
}

export interface YieldTokenMetrics {
  symbol: string;
  name: string;
  tag: string;
  rsi: number;
  price: number;
  sma14: number;
  priceVsSma14Pct: number;
  fundamentalScore: number;
  atr14Pct?: number;
  live?: boolean;
  fetchedAt?: string;
}

export interface YieldFilterEvaluation extends YieldTokenMetrics {
  conditions: YieldFilterCondition[];
  filtersPassedCount: number;
  passed: boolean;
  failureReasons: string[];
  convictionScore: number;
}

export interface YieldAllocationRow extends YieldFilterEvaluation {
  weight: number;
  amountUsd: number;
  shareOfYieldPercent: number;
}

export const YIELD_ALTCOIN_UNIVERSE = DCA_YIELD_TOKENS.map((token) => ({
  symbol: token.symbol,
  name: token.name,
  tag: token.chainTag,
}));

function evaluateConditions(metrics: YieldTokenMetrics): YieldFilterCondition[] {
  const { rsiMax, sma14FloorPct, fundamentalMin } = YIELD_FILTER_THRESHOLDS;

  const rsiPassed = metrics.rsi < rsiMax;
  const smaPassed = metrics.priceVsSma14Pct >= sma14FloorPct;
  const fundamentalPassed = metrics.fundamentalScore >= fundamentalMin;

  return [
    {
      id: "rsi",
      passed: rsiPassed,
      detail: rsiPassed
        ? `RSI Oversold (${metrics.rsi})`
        : `RSI prekúpené (${metrics.rsi} ≥ ${rsiMax})`,
    },
    {
      id: "sma14",
      passed: smaPassed,
      detail: smaPassed
        ? `Cena nad SMA14 (${metrics.priceVsSma14Pct >= 0 ? "+" : ""}${metrics.priceVsSma14Pct.toFixed(0)}%)`
        : `Cena hlboko pod SMA14 (${metrics.priceVsSma14Pct.toFixed(0)}%)`,
    },
    {
      id: "fundamental",
      passed: fundamentalPassed,
      detail: fundamentalPassed
        ? `Fundament silný (${metrics.fundamentalScore})`
        : `Fundament slabý (${metrics.fundamentalScore} < ${fundamentalMin})`,
    },
  ];
}

function buildUnavailableEvaluation(
  coin: (typeof YIELD_ALTCOIN_UNIVERSE)[number],
): YieldFilterEvaluation {
  const unavailableDetail = "Live dáta nedostupné (Binance)";
  return {
    symbol: coin.symbol,
    name: coin.name,
    tag: coin.tag,
    rsi: 0,
    price: 0,
    sma14: 0,
    priceVsSma14Pct: 0,
    fundamentalScore: 0,
    live: false,
    conditions: [
      { id: "rsi", passed: false, detail: unavailableDetail },
      { id: "sma14", passed: false, detail: unavailableDetail },
      { id: "fundamental", passed: false, detail: unavailableDetail },
    ],
    filtersPassedCount: 0,
    passed: false,
    failureReasons: [unavailableDetail],
    convictionScore: 0,
  };
}

export function evaluateYieldToken(
  coin: (typeof YIELD_ALTCOIN_UNIVERSE)[number],
  metrics: YieldTokenMetrics | null | undefined,
): YieldFilterEvaluation {
  if (!metrics) {
    return buildUnavailableEvaluation(coin);
  }

  const conditions = evaluateConditions(metrics);
  const filtersPassedCount = conditions.filter((c) => c.passed).length;
  const passed = filtersPassedCount === 3;
  const failureReasons = conditions
    .filter((c) => !c.passed)
    .map((c) => c.detail);

  return {
    ...metrics,
    conditions,
    filtersPassedCount,
    passed,
    failureReasons,
    convictionScore: metrics.fundamentalScore,
  };
}

export function convictionWeight(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return Math.pow(clamped, YIELD_FILTER_THRESHOLDS.weightExponent);
}

export function distributeYieldExponential(
  yieldBudgetUsd: number,
  passedTokens: YieldFilterEvaluation[],
): YieldAllocationRow[] {
  if (passedTokens.length === 0 || yieldBudgetUsd <= 0) {
    return passedTokens.map((token) => ({
      ...token,
      weight: 0,
      amountUsd: 0,
      shareOfYieldPercent: 0,
    }));
  }

  const weighted = passedTokens.map((token) => ({
    token,
    weight: convictionWeight(token.convictionScore),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);

  return weighted.map(({ token, weight }) => {
    const share = totalWeight > 0 ? weight / totalWeight : 0;
    const amountUsd = Math.round(yieldBudgetUsd * share * 100) / 100;

    return {
      ...token,
      weight,
      amountUsd,
      shareOfYieldPercent:
        yieldBudgetUsd > 0
          ? Math.round((amountUsd / yieldBudgetUsd) * 1000) / 10
          : 0,
    };
  });
}

export function buildYieldFilterAllocations(
  yieldBudgetUsd: number,
  metricsMap: Record<string, YieldTokenMetrics>,
): {
  conviction: YieldAllocationRow[];
  excluded: YieldFilterEvaluation[];
} {
  const evaluations = YIELD_ALTCOIN_UNIVERSE.map((coin) =>
    evaluateYieldToken(coin, metricsMap[coin.symbol]),
  );
  const passed = evaluations.filter((e) => e.passed);
  const excluded = evaluations.filter((e) => !e.passed);
  const conviction = distributeYieldExponential(yieldBudgetUsd, passed);

  return { conviction, excluded };
}

export interface SpilloverResult {
  coreUsd: number;
  satelliteUsd: number;
  yieldUsd: number;
  spilloverActive: boolean;
  spilloverAmount: number;
}

/** Redistribute unused yield budget to core/satellite preserving their ratio. */
export function applyYieldSpillover(input: {
  coreUsd: number;
  satelliteUsd: number;
  yieldUsd: number;
  convictionCount: number;
}): SpilloverResult {
  const { coreUsd, satelliteUsd, yieldUsd, convictionCount } = input;

  if (convictionCount > 0 || yieldUsd <= 0) {
    return {
      coreUsd,
      satelliteUsd,
      yieldUsd,
      spilloverActive: false,
      spilloverAmount: 0,
    };
  }

  const nonYieldTotal = coreUsd + satelliteUsd;
  if (nonYieldTotal <= 0) {
    return {
      coreUsd: coreUsd + yieldUsd,
      satelliteUsd,
      yieldUsd: 0,
      spilloverActive: true,
      spilloverAmount: yieldUsd,
    };
  }

  const coreShare = coreUsd / nonYieldTotal;
  const satShare = satelliteUsd / nonYieldTotal;

  return {
    coreUsd: Math.round((coreUsd + yieldUsd * coreShare) * 100) / 100,
    satelliteUsd: Math.round((satelliteUsd + yieldUsd * satShare) * 100) / 100,
    yieldUsd: 0,
    spilloverActive: true,
    spilloverAmount: yieldUsd,
  };
}
