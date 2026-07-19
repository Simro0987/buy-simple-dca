import type { AssetCategory } from "@/lib/portfolioStorage";
import type {
  DcaMarketSnapshot,
  DcaTokenDefinition,
  TokenMarketSnapshot,
} from "@/lib/dcaMarketData";
import { resolveActiveDcaTokens } from "@/lib/dcaMarketData";

export type ConfidenceLevel = "high" | "medium" | "low";
export type MoneyMode = "CAPITULATION" | "ACCUMULATION" | "NEUTRAL" | "EUPHORIA";
export type EfficiencyGrade = "A" | "B" | "C" | "D" | "E" | "F";

export interface FactorScore {
  id: string;
  name: string;
  score: number;
  status: string;
  weight: number;
}

export interface CapitalPipeline {
  aWeeklyBudget: number;
  bConfluenceScore: number;
  cAllocationPercent: number;
  dDeployedCapital: number;
  eReserveCapital: number;
}

export interface ExecutionAdvisor {
  alphaVsMarketPct: number;
  marketDcaBaselinePct: number;
  efficiencyGrade: EfficiencyGrade;
  activeAdvice: string;
  dcaTransactionCount: number;
}

export interface MasterTokenPlan {
  symbol: string;
  name: string;
  category: AssetCategory;
  logoUrl: string;
  weightPercent: number;
  totalUsd: number;
  marketUsd: number;
  limitUsd: number;
  marketShare: number;
  limitShare: number;
  spotPrice: number;
  limitPrice: number;
  change24h: number;
  whyLimit: string;
  yieldMergeActive: boolean;
  brakeActive: boolean;
  hasLiveData: boolean;
  marketStatusFallback: boolean;
  rsi14: number | null;
  atr14d: number | null;
}

export interface MasterDcaResult {
  moneyMode: MoneyMode;
  confluenceScore: number;
  factors: FactorScore[];
  allocationPercent: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  capitalPipeline: CapitalPipeline;
  tokenPlans: MasterTokenPlan[];
  marketLimitSplit: { market: number; limit: number };
  brakeActive: boolean;
  regimeLabel: string;
  regimeDescription: string;
  advisor: ExecutionAdvisor;
  degraded: boolean;
}

const FACTOR_WEIGHTS = {
  value: 0.22,
  trend: 0.22,
  sentiment: 0.18,
  momentum: 0.18,
  risk: 0.2,
} as const;

const CONFIDENCE_MULTIPLIERS: Record<ConfidenceLevel, number> = {
  high: 1.0,
  medium: 0.93,
  low: 0.85,
};

const BRAKE_THRESHOLD_PCT = 40;
const YIELD_RSI_MERGE_THRESHOLD = 38;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreValue(distance200wPct: number): number {
  return clamp(50 - distance200wPct * 1.25, 0, 100);
}

function scoreSentiment(fearGreed: number): number {
  return clamp(100 - fearGreed, 0, 100);
}

function scoreMomentum(rsi: number | null, price: number, ma200d: number): number {
  const rsiScore = rsi != null ? clamp(100 - rsi, 0, 100) : 50;
  const smaScore =
    ma200d > 0 && price > 0
      ? clamp(50 - ((price - ma200d) / ma200d) * 100, 0, 100)
      : 50;
  return Math.round((rsiScore + smaScore) / 2);
}

function scoreCbbc(mayer: number): { score: number; status: string } {
  if (mayer < 0.9) return { score: 88, status: "Accum" };
  if (mayer < 1.1) return { score: 74, status: "Support" };
  if (mayer < 1.5) return { score: 55, status: "Neutral" };
  if (mayer < 2.4) return { score: 35, status: "Extended" };
  return { score: 15, status: "Overheat" };
}

function scoreRisk(atrPct: number, cbbcScore: number): number {
  const volScore = clamp(100 - atrPct * 12, 0, 100);
  return Math.round((volScore + cbbcScore) / 2);
}

function scoreTrend(distance200wPct: number, mayer: number): number {
  const wmaTrend = clamp(50 - distance200wPct * 1.1, 0, 100);
  const mayerTrend = clamp(100 - (mayer - 1) * 40, 0, 100);
  return Math.round((wmaTrend + mayerTrend) / 2);
}

function resolveMoneyMode(fg: number, score: number): MoneyMode {
  if (fg <= 25 || score < 25) return "CAPITULATION";
  if (fg >= 75 || score > 85) return "EUPHORIA";
  if (fg <= 45 || score < 50) return "ACCUMULATION";
  return "NEUTRAL";
}

function resolveConfidence(snapshot: DcaMarketSnapshot): ConfidenceLevel {
  if (snapshot.degraded) return "low";
  const hasRsi =
    snapshot.marketData.eth.rsi14 != null ||
    snapshot.marketData.sol.rsi14 != null;
  if (!hasRsi || snapshot.marketData.btc.ma200wStale) return "medium";
  return "high";
}

function computeAllocationPercent(
  score: number,
  fearGreed: number,
  brakeActive: boolean,
): number {
  let alloc = 82 - score * 0.62;
  alloc = clamp(alloc, 22, 80);

  if (fearGreed <= 25 && score < 15) {
    alloc = 85;
  } else if (fearGreed >= 75 && score > 90) {
    alloc = 20;
  }

  if (brakeActive) {
    alloc *= 0.5;
  }

  return Math.round(alloc * 10) / 10;
}

function matrixSplit(fearGreed: number): { market: number; limit: number } {
  if (fearGreed <= 30) return { market: 70, limit: 30 };
  if (fearGreed >= 75) return { market: 20, limit: 80 };
  const t = (fearGreed - 30) / 45;
  const market = Math.round(70 - t * 50);
  return { market, limit: 100 - market };
}

function getTokenRsi(
  symbol: string,
  marketData: DcaMarketSnapshot["marketData"],
): number | null {
  if (symbol === "ETH") return marketData.eth.rsi14;
  if (symbol === "SOL") return marketData.sol.rsi14;
  return marketData.eth.rsi14;
}

function getTokenAtr(
  symbol: string,
  marketData: DcaMarketSnapshot["marketData"],
): number | null {
  if (symbol === "BTC") return marketData.btc.atr14d;
  if (symbol === "ETH") return marketData.eth.atr14d;
  if (symbol === "SOL") return marketData.sol.atr14d;
  return marketData.btc.atr14d;
}

function buildWhyLimit(
  symbol: string,
  spot: number,
  limitPrice: number,
  rsi: number | null,
  distance200w: number,
  brakeActive: boolean,
  yieldMerge: boolean,
): string {
  if (yieldMerge) {
    return `RSI ${rsi?.toFixed(0) ?? "—"} < 38 — Yield Merge Rule aktivovaná, 100 % Market nákup`;
  }
  if (brakeActive) {
    return `Prah brzdy: cena +${distance200w.toFixed(0)} % nad 200WMA — agresivita znížená o 50 %`;
  }
  if (rsi != null && rsi < 45) {
    return `Cena pod 50D EMA, cielime na 7D support — limit @ ${formatPrice(limitPrice)}`;
  }
  if (distance200w < -10) {
    return `Hlboká zóna akumulácie pod 200WMA — limit na ATR pullback @ ${formatPrice(limitPrice)}`;
  }
  if (distance200w > 15) {
    return `Cena nad 200WMA — preferujeme limitný vstup pri korekcii @ ${formatPrice(limitPrice)}`;
  }
  return `Dynamický limit: Spot − 1.5× ATR @ ${formatPrice(limitPrice)} pre ${symbol}`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

function computeEfficiencyGrade(alphaPct: number): EfficiencyGrade {
  if (alphaPct >= 15) return "A";
  if (alphaPct >= 8) return "B";
  if (alphaPct >= 2) return "C";
  if (alphaPct >= -2) return "D";
  if (alphaPct >= -8) return "E";
  return "F";
}

function buildAdvisor(
  dcaTransactions: Array<{
    symbol: string;
    spentUsd: number;
    priceUsd: number;
    amount: number;
  }>,
  currentPrices: Record<string, number>,
): ExecutionAdvisor {
  if (dcaTransactions.length === 0) {
    return {
      alphaVsMarketPct: 0,
      marketDcaBaselinePct: 0,
      efficiencyGrade: "C",
      activeAdvice: "Zaznamenajte prvý DCA nákup pre sledovanie Alpha vs Market.",
      dcaTransactionCount: 0,
    };
  }

  let totalSpent = 0;
  let totalAmount = 0;
  for (const tx of dcaTransactions) {
    totalSpent += tx.spentUsd;
    totalAmount += tx.amount;
  }

  const avgBuyPrice = totalAmount > 0 ? totalSpent / totalAmount : 0;
  const primarySymbol = dcaTransactions[0]?.symbol ?? "BTC";
  const currentPrice = currentPrices[primarySymbol] ?? avgBuyPrice;
  const alphaPct =
    avgBuyPrice > 0 ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : 0;

  const grade = computeEfficiencyGrade(alphaPct);
  const advice =
    grade === "A" || grade === "B"
      ? "Výborná efektivita — pokračujte v dynamickom DCA pláne."
      : grade === "C" || grade === "D"
        ? "Priemerná efektivita — zvážte vyšší limitný podiel pri korekciách."
        : "Pod trhom — využite Capitulation režim pre agresívnejšiu alokáciu.";

  return {
    alphaVsMarketPct: Math.round(alphaPct * 10) / 10,
    marketDcaBaselinePct: Math.round(alphaPct * 0.6 * 10) / 10,
    efficiencyGrade: grade,
    activeAdvice: advice,
    dcaTransactionCount: dcaTransactions.length,
  };
}

export function computeMasterDcaEngine(input: {
  weeklyBudget: number;
  snapshot: DcaMarketSnapshot;
  portfolioSymbols?: string[];
  dcaTransactions?: Array<{
    symbol: string;
    spentUsd: number;
    priceUsd: number;
    amount: number;
  }>;
}): MasterDcaResult {
  const { weeklyBudget, snapshot, portfolioSymbols, dcaTransactions = [] } =
    input;
  const { fearGreed, marketData, tokens, degraded } = snapshot;

  const btcPrice = marketData.btc.price || tokens.BTC?.price || 0;
  const ma200w = marketData.btc.ma200w;
  const distance200w =
    ma200w > 0 && btcPrice > 0
      ? ((btcPrice - ma200w) / ma200w) * 100
      : 0;

  const brakeActive = distance200w > BRAKE_THRESHOLD_PCT;

  const valueScore = scoreValue(distance200w);
  const sentimentScore = scoreSentiment(fearGreed.value);
  const momentumScore = scoreMomentum(
    marketData.eth.rsi14,
    btcPrice,
    marketData.btc.ma200d,
  );
  const cbbc = scoreCbbc(marketData.btc.mayerMultiple);
  const riskScore = scoreRisk(marketData.btc.atr14d, cbbc.score);
  const trendScore = scoreTrend(distance200w, marketData.btc.mayerMultiple);

  const factors: FactorScore[] = [
    {
      id: "value",
      name: "Value",
      score: Math.round(valueScore),
      status:
        distance200w < -5
          ? "Strong Buy"
          : distance200w > 20
            ? "Extended"
            : "Fair",
      weight: FACTOR_WEIGHTS.value,
    },
    {
      id: "trend",
      name: "Trend",
      score: trendScore,
      status:
        distance200w < 0
          ? "Akumulácia"
          : distance200w > 20
            ? "Rast"
            : "Neutrál",
      weight: FACTOR_WEIGHTS.trend,
    },
    {
      id: "sentiment",
      name: "Sentiment",
      score: Math.round(sentimentScore),
      status: fearGreed.classification,
      weight: FACTOR_WEIGHTS.sentiment,
    },
    {
      id: "momentum",
      name: "Momentum",
      score: momentumScore,
      status:
        momentumScore >= 60
          ? "Oversold"
          : momentumScore <= 40
            ? "Overbought"
            : "Neutral",
      weight: FACTOR_WEIGHTS.momentum,
    },
    {
      id: "risk",
      name: "Risk",
      score: riskScore,
      status: `ATR ${marketData.btc.atr14d.toFixed(1)}% · ${cbbc.status}`,
      weight: FACTOR_WEIGHTS.risk,
    },
  ];

  const confluenceScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) /
      Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0),
  );

  const confidence = resolveConfidence(snapshot);
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidence];

  let allocationPercent = computeAllocationPercent(
    confluenceScore,
    fearGreed.value,
    brakeActive,
  );
  allocationPercent =
    Math.round(allocationPercent * confidenceMultiplier * 10) / 10;
  allocationPercent = clamp(allocationPercent, 22, 85);

  const deployedCapital =
    Math.round(weeklyBudget * (allocationPercent / 100) * 100) / 100;
  const reserveCapital =
    Math.round((weeklyBudget - deployedCapital) * 100) / 100;

  const moneyMode = resolveMoneyMode(fearGreed.value, confluenceScore);
  const baseSplit = matrixSplit(fearGreed.value);

  const activeTokens = resolveActiveDcaTokens(portfolioSymbols);
  const totalWeight = activeTokens.reduce((s, t) => s + t.weightPercent, 0);

  const tokenPlans: MasterTokenPlan[] = activeTokens.map((token) => {
    const snap: TokenMarketSnapshot | undefined = tokens[token.symbol];
    const spot = snap?.price ?? 0;
    const hasLiveData = snap?.hasLiveData ?? false;
    const rsi = getTokenRsi(token.symbol, marketData);
    const atr = getTokenAtr(token.symbol, marketData);
    const isYield = token.category === "yield";
    const yieldMerge =
      isYield && rsi != null && rsi < YIELD_RSI_MERGE_THRESHOLD;

    let marketShare = baseSplit.market;
    let limitShare = baseSplit.limit;

    if (yieldMerge) {
      marketShare = 100;
      limitShare = 0;
    } else if (brakeActive) {
      marketShare = Math.round(marketShare * 0.5);
      limitShare = 100 - marketShare;
    }

    const weightNorm =
      totalWeight > 0 ? token.weightPercent / totalWeight : 0;
    const totalUsd =
      Math.round(deployedCapital * weightNorm * 100) / 100;
    const marketUsd =
      Math.round(totalUsd * (marketShare / 100) * 100) / 100;
    const limitUsd =
      Math.round((totalUsd - marketUsd) * 100) / 100;

    const atrPct = atr ?? marketData.btc.atr14d;
    const limitPrice =
      spot > 0
        ? Math.round(spot * (1 - (1.5 * atrPct) / 100) * 100) / 100
        : 0;

    const marketStatusFallback = !hasLiveData && spot <= 0;

    return {
      symbol: token.symbol,
      name: token.name,
      category: token.category,
      logoUrl: snap?.image ?? token.logoUrl,
      weightPercent: token.weightPercent,
      totalUsd,
      marketUsd,
      limitUsd,
      marketShare,
      limitShare,
      spotPrice: spot,
      limitPrice,
      change24h: snap?.change24h ?? 0,
      whyLimit: buildWhyLimit(
        token.symbol,
        spot,
        limitPrice,
        rsi,
        distance200w,
        brakeActive,
        yieldMerge,
      ),
      yieldMergeActive: yieldMerge,
      brakeActive,
      hasLiveData,
      marketStatusFallback,
      rsi14: rsi,
      atr14d: atr,
    };
  });

  const regimeLabel =
    moneyMode === "CAPITULATION"
      ? "BEAR"
      : moneyMode === "EUPHORIA"
        ? "BULL"
        : moneyMode === "ACCUMULATION"
          ? "ACCUM"
          : "NEUTRAL";

  const regimeDescription =
    moneyMode === "CAPITULATION"
      ? "Medvedí trend — agresívna akumulácia"
      : moneyMode === "EUPHORIA"
        ? "Euforia — defenzívna alokácia"
        : moneyMode === "ACCUMULATION"
          ? "Akumulačná zóna"
          : "Neutrálny režim";

  const currentPrices: Record<string, number> = {};
  for (const [sym, t] of Object.entries(tokens)) {
    currentPrices[sym] = t.price;
  }

  const advisor = buildAdvisor(
    dcaTransactions.filter((tx) => tx.priceUsd > 0),
    currentPrices,
  );

  return {
    moneyMode,
    confluenceScore,
    factors,
    allocationPercent,
    confidence,
    confidenceMultiplier,
    capitalPipeline: {
      aWeeklyBudget: weeklyBudget,
      bConfluenceScore: confluenceScore,
      cAllocationPercent: allocationPercent,
      dDeployedCapital: deployedCapital,
      eReserveCapital: reserveCapital,
    },
    tokenPlans,
    marketLimitSplit: baseSplit,
    brakeActive,
    regimeLabel,
    regimeDescription,
    advisor,
    degraded,
  };
}

export function toExecutionPlans(result: MasterDcaResult) {
  return result.tokenPlans.map((plan) => ({
    symbol: plan.symbol,
    name: plan.name,
    category: plan.category,
    logoUrl: plan.logoUrl,
    weightPercent: plan.weightPercent,
    totalUsd: plan.totalUsd,
    marketUsd: plan.marketUsd,
    limitUsd: plan.limitUsd,
    marketShare: plan.marketShare,
    limitShare: plan.limitShare,
    limitPrice: plan.limitPrice,
    whyLimit: plan.whyLimit,
    spotPrice: plan.spotPrice,
    change24h: plan.change24h,
    yieldMergeActive: plan.yieldMergeActive,
    brakeActive: plan.brakeActive,
    hasLiveData: plan.hasLiveData,
    marketStatusFallback: plan.marketStatusFallback,
    confidence: result.confidence,
  }));
}
