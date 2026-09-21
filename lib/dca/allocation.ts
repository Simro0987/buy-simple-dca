import {
  limitDiscountFromTrend,
  marketShareFromRsi,
  statusFromRsi,
} from "@/lib/dca/executionMath";
import { clamp, roundUsd, softmax } from "@/lib/dca/math";
import { buildMarketRegime } from "@/lib/dca/regime";
import type {
  AllocationMode,
  DcaSymbol,
  TokenExecutionPlan,
  TokenMarketSnapshot,
  WeeklyDcaPlan,
} from "@/lib/dca/types";
import { DCA_TOKENS, TOKEN_BY_SYMBOL } from "@/lib/dca/universe";

function tokenScore(snapshot: TokenMarketSnapshot): number {
  const rsi = snapshot.indicators?.rsi ?? 50;
  const smaDev = snapshot.indicators?.sma200DevPct ?? 0;
  const apy = snapshot.yieldApy ?? 0;
  const value = clamp(100 - rsi, 5, 95);
  const trendDip = clamp(55 - smaDev, 10, 90);
  const yieldBoost = clamp(apy * 6, 0, 25);
  return value * 0.55 + trendDip * 0.3 + yieldBoost * 0.15;
}

function ilRrLabel(apy: number | null, atrPct: number): string {
  if (apy == null) return "n/a";
  const ratio = atrPct > 0 ? apy / atrPct : apy;
  if (ratio >= 1.4) return "priaznivý";
  if (ratio >= 0.7) return "vyvážený";
  return "opatrný";
}

function buildPlan(
  snapshot: TokenMarketSnapshot,
  usd: number,
  weeklyAmount: number,
  moneyMode: boolean,
  stopped: boolean,
): TokenExecutionPlan {
  const meta = TOKEN_BY_SYMBOL[snapshot.symbol];
  const ind = snapshot.indicators;
  const rsi = ind?.rsi ?? 50;
  const price = snapshot.price;
  const marketShare = stopped ? 0 : marketShareFromRsi(rsi, moneyMode);
  const limitShare = 100 - marketShare;
  const discount = limitDiscountFromTrend(price, ind?.ema50 ?? price, ind?.atr ?? 0);
  const totalUsd = roundUsd(usd);
  const marketUsd = roundUsd(totalUsd * (marketShare / 100));
  const limitUsd = roundUsd(totalUsd - marketUsd);
  const qty = price > 0 ? totalUsd / price : 0;
  const atrPct = price > 0 && ind ? (ind.atr / price) * 100 : 0;

  return {
    symbol: snapshot.symbol,
    name: meta.name,
    category: meta.category,
    subTags: meta.subTags,
    weightPercent: weeklyAmount > 0 ? (totalUsd / weeklyAmount) * 100 : 0,
    totalUsd,
    marketUsd,
    limitUsd,
    marketShare,
    limitShare,
    limitPrice: price > 0 ? price * (1 - discount) : 0,
    discountPct: discount * 100,
    qty,
    marketQty: price > 0 ? marketUsd / price : 0,
    limitQty: price > 0 ? limitUsd / price : 0,
    score: tokenScore(snapshot),
    status: statusFromRsi(rsi),
    rsi,
    price,
    atr: ind?.atr ?? 0,
    ema50: ind?.ema50 ?? 0,
    sma200: ind?.sma200 ?? 0,
    ema200: ind?.ema200 ?? 0,
    sma200DevPct: ind?.sma200DevPct ?? 0,
    ema50DevPct: ind?.ema50DevPct ?? 0,
    s1: ind?.s1 ?? 0,
    r1: ind?.r1 ?? 0,
    atrBand: ind ? 2.5 * ind.atr : 0,
    yieldApy: snapshot.yieldApy,
    yieldProject: snapshot.yieldProject,
    ilRr: ilRrLabel(snapshot.yieldApy, atrPct),
    bullMarket: Boolean(ind && snapshot.price > ind.sma200),
    stopped,
  };
}

function distribute(
  snapshots: TokenMarketSnapshot[],
  budget: number,
): { symbol: DcaSymbol; usd: number }[] {
  if (snapshots.length === 0 || budget <= 0) return [];
  const weights = softmax(snapshots.map((snapshot) => tokenScore(snapshot) / 12));
  return snapshots.map((snapshot, index) => ({
    symbol: snapshot.symbol,
    usd: budget * weights[index],
  }));
}

export function buildWeeklyDcaPlan(options: {
  weeklyAmount: number;
  moneyMode: boolean;
  allocationMode: AllocationMode;
  snapshots: Partial<Record<DcaSymbol, TokenMarketSnapshot>>;
}): WeeklyDcaPlan {
  const { weeklyAmount, moneyMode, allocationMode, snapshots } = options;
  const btc = snapshots.BTC;
  const regime = buildMarketRegime(btc, moneyMode);
  const safeWeekly = Math.max(0, weeklyAmount);
  const deployedUsd = roundUsd(safeWeekly * (regime.allocationPercent / 100));
  const reserveUsd = roundUsd(Math.max(0, safeWeekly - deployedUsd));

  const targetCorePct =
    allocationMode === "BTC_ONLY" ? 1 : moneyMode ? 0.52 : 0.55;
  let coreUsd = deployedUsd * targetCorePct;
  coreUsd = Math.max(deployedUsd * 0.5, coreUsd);
  if (allocationMode === "BTC_ONLY") coreUsd = deployedUsd;
  coreUsd = roundUsd(Math.min(deployedUsd, coreUsd));
  let altUsd = roundUsd(Math.max(0, deployedUsd - coreUsd));

  // TODO: Implement specific High-Beta filter logic later
  const highBetaUniverse = DCA_TOKENS.filter((token) => token.category === "HIGH_BETA");
  const satelliteUniverse = DCA_TOKENS.filter((token) => token.category === "SATELLITE");

  const isStopped = (symbol: DcaSymbol) => {
    const rsi = snapshots[symbol]?.indicators?.rsi;
    return typeof rsi === "number" && rsi > 70;
  };

  const stoppedSymbols = DCA_TOKENS.map((token) => token.symbol).filter(
    (symbol) => symbol !== "BTC" && isStopped(symbol),
  );

  const activeSats = satelliteUniverse
    .map((token) => snapshots[token.symbol])
    .filter((snapshot): snapshot is TokenMarketSnapshot => {
      return Boolean(snapshot && snapshot.price > 0 && !isStopped(snapshot.symbol));
    });
  const activeBeta = highBetaUniverse
    .map((token) => snapshots[token.symbol])
    .filter((snapshot): snapshot is TokenMarketSnapshot => {
      return Boolean(snapshot && snapshot.price > 0 && !isStopped(snapshot.symbol));
    });

  const redirectedUsd = stoppedSymbols.length > 0 ? altUsd * 0.12 : 0;
  coreUsd = roundUsd(Math.min(deployedUsd, coreUsd + redirectedUsd));
  altUsd = roundUsd(Math.max(0, deployedUsd - coreUsd));

  const betaBudget = allocationMode === "BTC_ONLY" ? 0 : altUsd * (moneyMode ? 0.28 : 0.18);
  const satBudget = Math.max(0, altUsd - betaBudget);

  const satDist = distribute(activeSats, satBudget);
  const betaDist = distribute(activeBeta, betaBudget);
  const unusedBeta = betaBudget - betaDist.reduce((sum, row) => sum + row.usd, 0);
  const unusedSat = satBudget - satDist.reduce((sum, row) => sum + row.usd, 0);
  coreUsd = roundUsd(coreUsd + Math.max(0, unusedBeta) + Math.max(0, unusedSat));

  const bySymbol = new Map<DcaSymbol, number>();
  bySymbol.set("BTC", coreUsd);
  for (const row of [...satDist, ...betaDist]) {
    bySymbol.set(row.symbol, (bySymbol.get(row.symbol) ?? 0) + row.usd);
  }

  const plans = DCA_TOKENS.map((meta) => {
    const snapshot = snapshots[meta.symbol] ?? {
      symbol: meta.symbol,
      price: 0,
      change24h: 0,
      indicators: null,
      yieldApy: null,
      yieldProject: null,
    };
    const usd = bySymbol.get(meta.symbol) ?? 0;
    const stopped = meta.symbol !== "BTC" && isStopped(meta.symbol);
    return buildPlan(snapshot, usd, safeWeekly, moneyMode, stopped);
  }).filter((plan) => plan.totalUsd > 0 || plan.stopped || plan.symbol === "BTC");

  const btcPlan = plans.find((plan) => plan.symbol === "BTC");
  const btcFloorSatisfied =
    deployedUsd <= 0 || ((btcPlan?.totalUsd ?? 0) / Math.max(deployedUsd, 1)) >= 0.5;

  const corePercent = deployedUsd > 0 ? (coreUsd / deployedUsd) * 100 : 0;
  const altPercent = 100 - corePercent;

  const allocationLabel =
    corePercent >= 62 ? "CONSERVATIVE" : corePercent <= 52 ? "AGGRESSIVE" : "BALANCED";
  const allocationSubtitle =
    allocationLabel === "BALANCED"
      ? "Vyvážená alokácia"
      : allocationLabel === "CONSERVATIVE"
        ? "Konzervatívna alokácia"
        : "Agresívnejšia alokácia";

  const narrative = [
    `BTC Core drží ${corePercent.toFixed(0)}% nasadeného kapitálu (floor 50%).`,
    allocationMode === "BTC_ONLY"
      ? "Režim BTC ONLY posiela celý nákup do Bitcoinu."
      : "Satelity (ETH, SOL, LINK, AAVE, UNI) dostávajú zvyšok dynamicky podľa skóre.",
    "High-beta (HYPE, ZEC, INJ) je menšia riziková vrstva — váhy sa menia s RSI a trendom.",
    stoppedSymbols.length > 0
      ? `STOP režim pri ${stoppedSymbols.join(", ")}: kapitál sa presúva do BTC Core a aktívnych satelitov.`
      : "Žiadny token nie je v STOP režime — kapitál ostáva v aktívnom splite.",
    "Váhy sa menia dynamicky podľa Value, Trend, Sentiment, Momentum a Risk.",
  ];

  return {
    regime,
    deployedUsd,
    reserveUsd,
    weeklyAmount: safeWeekly,
    coreUsd,
    altUsd,
    corePercent,
    altPercent,
    btcFloorSatisfied,
    stoppedSymbols,
    plans,
    narrative,
    allocationLabel,
    allocationSubtitle,
  };
}
