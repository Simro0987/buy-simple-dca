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

export const YIELD_ALTCOIN_UNIVERSE: {
  symbol: string;
  name: string;
  tag: string;
}[] = [
  { symbol: "HYPE", name: "Hyperliquid", tag: "ARB" },
  { symbol: "JUP", name: "Jupiter", tag: "SOL" },
  { symbol: "AAVE", name: "Aave", tag: "ETH" },
  { symbol: "MORPHO", name: "Morpho", tag: "ETH" },
  { symbol: "LINK", name: "Chainlink", tag: "ETH" },
  { symbol: "GMX", name: "GMX", tag: "ARB" },
  { symbol: "PENDLE", name: "Pendle", tag: "ETH" },
];

function symbolSeed(symbol: string): number {
  return symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

/** Deterministic mock metrics until live RSI / SMA14 / fundamental feeds are wired. */
export function mockYieldTokenMetrics(
  coin: (typeof YIELD_ALTCOIN_UNIVERSE)[number],
): YieldTokenMetrics {
  const seed = symbolSeed(coin.symbol);
  const rsi = 20 + ((seed * 7) % 71);
  const fundamentalScore = 25 + ((seed * 13) % 76);
  const priceVsSma14Pct = -25 + ((seed * 11) % 41);
  const sma14 = 100;
  const price = sma14 * (1 + priceVsSma14Pct / 100);

  return {
    symbol: coin.symbol,
    name: coin.name,
    tag: coin.tag,
    rsi,
    price,
    sma14,
    priceVsSma14Pct: Math.round(priceVsSma14Pct * 10) / 10,
    fundamentalScore,
  };
}

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

export function evaluateYieldToken(
  coin: (typeof YIELD_ALTCOIN_UNIVERSE)[number],
): YieldFilterEvaluation {
  const metrics = mockYieldTokenMetrics(coin);
  const conditions = evaluateConditions(metrics);
  const filtersPassedCount = conditions.filter((c) => c.passed).length;
  const passed = filtersPassedCount === 3;
  const failureReasons = conditions.filter((c) => !c.passed).map((c) => c.detail);

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

export function buildYieldFilterAllocations(yieldBudgetUsd: number): {
  conviction: YieldAllocationRow[];
  excluded: YieldFilterEvaluation[];
} {
  const evaluations = YIELD_ALTCOIN_UNIVERSE.map(evaluateYieldToken);
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
