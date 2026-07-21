import type { ConfluenceMetric, TokenOctagonSnapshot } from "@/lib/confluenceOctagon";
import type { ExecutionPerformanceEntry } from "@/lib/executionPerformanceLog";
import type { EfficiencyGrade } from "@/lib/masterDcaEngine";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { AssetCategory } from "@/lib/portfolioStorage";
import type { YieldSatelliteMetrics } from "@/lib/yieldSatelliteMetrics";

export interface TokenExecutionAdvisor {
  symbol: string;
  name: string;
  category: AssetCategory;
  accumulationScore: number;
  alphaVsMarketPct: number;
  marketDcaBaselinePct: number;
  rewardScore: number;
  efficiencyGrade: EfficiencyGrade;
  previousGrade: EfficiencyGrade;
  weeklyCount: number;
  activeAdvice: string;
  preferredRoute: "market" | "limit";
  octagonMetrics: ConfluenceMetric[];
  learnedPatterns: string[];
  executionCount: number;
  yieldSatelliteMetrics: YieldSatelliteMetrics | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeEfficiencyGradeFromReward(
  rewardScore: number,
): EfficiencyGrade {
  if (rewardScore >= 55) return "A";
  if (rewardScore >= 30) return "B";
  if (rewardScore >= 10) return "C";
  if (rewardScore >= -5) return "D";
  if (rewardScore >= -25) return "E";
  return "F";
}

export function computeEfficiencyGradeFromAlpha(alphaPct: number): EfficiencyGrade {
  if (alphaPct >= 15) return "A";
  if (alphaPct >= 8) return "B";
  if (alphaPct >= 2) return "C";
  if (alphaPct >= -2) return "D";
  if (alphaPct >= -8) return "E";
  return "F";
}

function weekKeyFromDate(date = new Date()): string {
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekKeyFromIsoDate(iso: string): string {
  return weekKeyFromDate(new Date(iso));
}

function countUniqueWeeks(entries: ExecutionPerformanceEntry[]): number {
  return new Set(entries.map((entry) => entry.weekKey)).size;
}

function findMetric(
  metrics: ConfluenceMetric[],
  subject: string,
): ConfluenceMetric | undefined {
  return metrics.find((metric) => metric.subject === subject);
}

function derivePreferredRoute(
  octagon: TokenOctagonSnapshot | null,
  executionPlan: TokenExecutionPlan | null,
): "market" | "limit" {
  if (executionPlan?.mergedExecutionRoute) {
    return executionPlan.mergedExecutionRoute;
  }
  if (!octagon) return "market";

  const wRsi = findMetric(octagon.metrics, "W-RSI")?.value ?? 50;
  const wma = findMetric(octagon.metrics, "200WMA")?.value ?? 50;
  const bollinger = findMetric(octagon.metrics, "Bollinger")?.value ?? 50;

  if (wRsi >= 65 && wma <= 45) return "market";
  if (bollinger >= 70 || wma >= 70) return "limit";
  return octagon.accumulationScore >= 55 ? "limit" : "market";
}

function buildLearnedPatterns(input: {
  entries: ExecutionPerformanceEntry[];
  octagon: TokenOctagonSnapshot | null;
  preferredRoute: "market" | "limit";
  yieldSatelliteMetrics?: YieldSatelliteMetrics | null;
  category?: AssetCategory;
}): string[] {
  const patterns: string[] = [];
  const { entries, octagon, preferredRoute, yieldSatelliteMetrics, category } =
    input;

  if (yieldSatelliteMetrics && (category === "yield" || category === "satellite")) {
    patterns.push(
      `Yield metriky: APY ${yieldSatelliteMetrics.apyPct.toFixed(1)}%, IL R/R ${yieldSatelliteMetrics.ilRiskRewardRatio.toFixed(1)}×, compound ${yieldSatelliteMetrics.stakingYieldMultiplier.toFixed(2)}×.`,
    );
    patterns.push(
      `Limitný pás ${yieldSatelliteMetrics.atrLimitMultiplier.toFixed(1)}×ATR — rebalans pri −${yieldSatelliteMetrics.rebalanceThresholdPct.toFixed(1)}%.`,
    );
  }

  const mergeCount = entries.filter((entry) => entry.minOrderMergeActive).length;
  if (mergeCount > 0) {
    patterns.push(
      `Min-order merge aktivovaný ${mergeCount}× — router zlučuje sub-$10 limitné nohy.`,
    );
  }

  const marketCount = entries.filter((entry) => entry.leg === "market").length;
  const limitCount = entries.filter((entry) => entry.leg === "limit").length;
  if (marketCount + limitCount > 0) {
    patterns.push(
      `História exekúcií: ${marketCount}× Market / ${limitCount}× Limit.`,
    );
  }

  if (octagon) {
    const wRsi = findMetric(octagon.metrics, "W-RSI");
    const funding = findMetric(octagon.metrics, "Funding");
    if (wRsi && wRsi.value >= 65) {
      patterns.push("W-RSI signalizuje akumulačnú zónu — limitné vstupy fungujú lepšie.");
    }
    if (funding && funding.value >= 70) {
      patterns.push("Funding proxy je priaznivý — Market vstupy majú vyššiu úspešnosť.");
    }
  }

  patterns.push(
    preferredRoute === "market"
      ? "Aktuálny bias: preferuj okamžitý Market vstup."
      : "Aktuálny bias: preferuj limitný vstup pri poklese.",
  );

  return patterns.slice(0, 4);
}

function buildActiveAdvice(input: {
  symbol: string;
  category: AssetCategory;
  octagon: TokenOctagonSnapshot | null;
  alphaVsMarketPct: number;
  marketDcaBaselinePct: number;
  efficiencyGrade: EfficiencyGrade;
  previousGrade: EfficiencyGrade;
  preferredRoute: "market" | "limit";
  weeklyCount: number;
  rewardScore: number;
  yieldSatelliteMetrics?: YieldSatelliteMetrics | null;
}): string {
  const {
    symbol,
    category,
    octagon,
    alphaVsMarketPct,
    marketDcaBaselinePct,
    efficiencyGrade,
    previousGrade,
    preferredRoute,
    weeklyCount,
    rewardScore,
    yieldSatelliteMetrics,
  } = input;

  const score = octagon?.accumulationScore ?? 0;
  const wRsi = findMetric(octagon?.metrics ?? [], "W-RSI")?.value;
  const wma = findMetric(octagon?.metrics ?? [], "200WMA")?.value;
  const atrProxy = findMetric(octagon?.metrics ?? [], "Vol. Mom.")?.value;

  const gradeTrend =
    efficiencyGrade < previousGrade
      ? "↑"
      : efficiencyGrade > previousGrade
        ? "↓"
        : "→";

  if (!octagon) {
    return `${symbol}: čakáme na live oktágon dáta — zaznamenajte prvú exekúciu pre self-learning loop.`;
  }

  if (weeklyCount === 0) {
    return `${symbol}: Oktágon ${score}/100 — ${preferredRoute === "market" ? "silnejší Market bias" : "preferuj Limit pri korekcii"}. Spustite prvú exekúciu pre sledovanie Alpha vs 7D priemer.`;
  }

  const routeHint =
    preferredRoute === "market"
      ? `Smart Router radí Market${wRsi != null ? ` (W-RSI ${wRsi})` : ""}.`
      : `Smart Router radí Limit${wma != null ? ` (200WMA skóre ${wma})` : ""}.`;

  const alphaHint =
    alphaVsMarketPct >= 0
      ? `Alpha +${round1(alphaVsMarketPct)} % vs vlastný priemer`
      : `Alpha ${round1(alphaVsMarketPct)} % vs vlastný priemer`;

  const marketHint = `7D baseline ${round1(marketDcaBaselinePct)} %`;

  const gradeHint =
    efficiencyGrade !== previousGrade
      ? `Grade ${previousGrade} ${gradeTrend} ${efficiencyGrade}`
      : `Grade ${efficiencyGrade}`;

  const rewardHint = `Ø reward ${round1(rewardScore)}`;

  const volatilityHint =
    atrProxy != null && atrProxy >= 70
      ? " Vol. Mom. vysoký — limitné knôty majú prioritu."
      : atrProxy != null && atrProxy <= 35
        ? " Nízka volatilita — Market vstup bez čakania."
        : "";

  const yieldHint =
    yieldSatelliteMetrics && (category === "yield" || category === "satellite")
      ? ` Yield APY ~${yieldSatelliteMetrics.apyPct.toFixed(1)}%, IL R/R ${yieldSatelliteMetrics.ilRiskRewardRatio.toFixed(1)}× — širší ${yieldSatelliteMetrics.atrLimitMultiplier.toFixed(1)}×ATR pás pred auto-kompaundáciou.`
      : "";

  return `${symbol}: Oktágon ${score}/100 — ${routeHint} ${alphaHint}, ${marketHint}, ${gradeHint}, ${rewardHint} (n=${weeklyCount} týž.).${volatilityHint}${yieldHint}`;
}

export function buildTokenExecutionAdvisor(input: {
  symbol: string;
  name: string;
  octagon: TokenOctagonSnapshot | null;
  executionEntries: ExecutionPerformanceEntry[];
  dcaTransactions: Array<{
    symbol: string;
    spentUsd: number;
    priceUsd: number;
    amount: number;
    date?: string;
  }>;
  currentPrice: number;
  executionPlan: TokenExecutionPlan | null;
}): TokenExecutionAdvisor {
  const symbolEntries = input.executionEntries.filter(
    (entry) => entry.symbol === input.symbol,
  );
  const symbolTxs = input.dcaTransactions.filter(
    (tx) => tx.symbol === input.symbol,
  );

  const weeklyCount = countUniqueWeeks(symbolEntries);
  const portfolioWeeks = new Set(
    symbolTxs.map((tx) => weekKeyFromIsoDate(tx.date ?? new Date().toISOString())),
  ).size;

  const effectiveWeeklyCount = Math.max(weeklyCount, portfolioWeeks);

  let totalSpent = 0;
  let totalAmount = 0;
  for (const tx of symbolTxs) {
    totalSpent += tx.spentUsd;
    totalAmount += tx.amount;
  }
  const avgBuyPrice = totalAmount > 0 ? totalSpent / totalAmount : 0;
  const currentPrice =
    input.currentPrice || input.octagon?.price || avgBuyPrice;
  const alphaVsMarketPct =
    avgBuyPrice > 0
      ? round1(((currentPrice - avgBuyPrice) / avgBuyPrice) * 100)
      : 0;

  const marketAvg7d = input.octagon?.avgPrice7d ?? currentPrice;
  const marketDcaBaselinePct =
    marketAvg7d > 0
      ? round1(((currentPrice - marketAvg7d) / marketAvg7d) * 100)
      : 0;

  const rewardScore =
    symbolEntries.length > 0
      ? round1(
          symbolEntries.reduce((sum, entry) => sum + entry.rewardScore, 0) /
            symbolEntries.length,
        )
      : round1(alphaVsMarketPct * 2);

  const efficiencyGrade = computeEfficiencyGradeFromReward(rewardScore);
  const previousGrade = computeEfficiencyGradeFromAlpha(
    alphaVsMarketPct * 0.75,
  );

  const preferredRoute = derivePreferredRoute(
    input.octagon,
    input.executionPlan,
  );

  const learnedPatterns = buildLearnedPatterns({
    entries: symbolEntries,
    octagon: input.octagon,
    preferredRoute,
    yieldSatelliteMetrics: input.executionPlan?.yieldSatelliteMetrics ?? null,
    category: input.executionPlan?.category ?? "core",
  });

  const activeAdvice = buildActiveAdvice({
    symbol: input.symbol,
    category: input.executionPlan?.category ?? "core",
    octagon: input.octagon,
    alphaVsMarketPct,
    marketDcaBaselinePct,
    efficiencyGrade,
    previousGrade,
    preferredRoute,
    weeklyCount: effectiveWeeklyCount,
    rewardScore,
    yieldSatelliteMetrics: input.executionPlan?.yieldSatelliteMetrics ?? null,
  });

  return {
    symbol: input.symbol,
    name: input.name,
    category: input.executionPlan?.category ?? "core",
    accumulationScore: input.octagon?.accumulationScore ?? 0,
    alphaVsMarketPct,
    marketDcaBaselinePct,
    rewardScore,
    efficiencyGrade,
    previousGrade,
    weeklyCount: effectiveWeeklyCount,
    activeAdvice,
    preferredRoute,
    octagonMetrics: input.octagon?.metrics ?? [],
    learnedPatterns,
    executionCount: symbolEntries.length,
    yieldSatelliteMetrics: input.executionPlan?.yieldSatelliteMetrics ?? null,
  };
}
