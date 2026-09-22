import {
  applyBrakeBoost,
  computeUniversalExecution,
  statusFromRsi,
} from "@/lib/dca/executionMath";
import { evaluateHighBetaToken } from "@/lib/dca/highBetaProtocol";
import { clamp, roundUsd, softmax } from "@/lib/dca/math";
import { buildMarketRegime } from "@/lib/dca/regime";
import { evaluateSatelliteToken } from "@/lib/dca/satelliteProtocol";
import type {
  AllocationMode,
  DcaSymbol,
  HighBetaBtcData,
  HighBetaEvaluation,
  HighBetaTokenData,
  SatelliteEvaluation,
  SatelliteTokenData,
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

function emptySnapshot(symbol: DcaSymbol): TokenMarketSnapshot {
  return {
    symbol,
    price: 0,
    change24h: 0,
    volume24h: 0,
    indicators: null,
    yieldApy: null,
    yieldProject: null,
    dailyCandles: [],
    weeklyCandles: [],
    upcomingUnlock: false,
  };
}

function toHighBetaTokenData(snapshot: TokenMarketSnapshot): HighBetaTokenData {
  return {
    symbol: snapshot.symbol,
    price: snapshot.price,
    volume24h: snapshot.volume24h,
    dailyCandles: snapshot.dailyCandles,
    weeklyCandles: snapshot.weeklyCandles,
    upcomingUnlock: snapshot.upcomingUnlock,
  };
}

function toHighBetaBtcData(btc: TokenMarketSnapshot | undefined): HighBetaBtcData {
  return {
    price: btc?.price ?? 0,
    dailyCandles: btc?.dailyCandles ?? [],
    weeklyCandles: btc?.weeklyCandles ?? [],
  };
}

function toSatelliteTokenData(snapshot: TokenMarketSnapshot): SatelliteTokenData {
  return {
    symbol: snapshot.symbol,
    price: snapshot.price,
    dailyCandles: snapshot.dailyCandles,
    weeklyCandles: snapshot.weeklyCandles,
  };
}

function buildPlan(
  snapshot: TokenMarketSnapshot,
  usd: number,
  weeklyAmount: number,
  moneyMode: boolean,
  stopped: boolean,
  highBeta: HighBetaEvaluation | null,
  highBetaRedirectedUsd: number,
  satellite: SatelliteEvaluation | null,
  satelliteRedirectedUsd: number,
): TokenExecutionPlan {
  const meta = TOKEN_BY_SYMBOL[snapshot.symbol];
  const ind = snapshot.indicators;
  const rsi = ind?.rsi ?? 50;
  const price = snapshot.price;
  const totalUsd = roundUsd(usd);
  const locked = Boolean(
    (highBeta && !highBeta.approved) || (satellite && !satellite.approved),
  );
  const execution =
    stopped || locked || totalUsd <= 0 || price <= 0
      ? null
      : computeUniversalExecution({
          allocatedUsd: totalUsd,
          rsi,
          category: meta.category,
          livePrice: price,
          ema50: ind?.ema50 ?? 0,
          atr: ind?.atr ?? 0,
          dailyCandles: snapshot.dailyCandles,
        });
  const marketShare = execution?.mktPercent ?? 0;
  const limitShare = execution ? execution.lmtPercent : 0;
  const originalMarketUsd = execution?.mktAmount ?? 0;
  const limitUsd = execution?.lmtAmount ?? 0;
  const brakeBoost = execution
    ? applyBrakeBoost(originalMarketUsd, price, ind?.ema50 ?? 0)
    : applyBrakeBoost(0, 0, 0);
  const marketUsd = brakeBoost.finalMktAmount;
  const executionUsd = roundUsd(marketUsd + limitUsd);
  const limitPrice = execution?.limitPrice ?? 0;
  const qty = price > 0 ? executionUsd / price : 0;
  const atrPct = price > 0 && ind ? (ind.atr / price) * 100 : 0;
  void moneyMode;

  return {
    symbol: snapshot.symbol,
    name: meta.name,
    category: meta.category,
    subTags: meta.subTags,
    weightPercent: weeklyAmount > 0 ? (totalUsd / weeklyAmount) * 100 : 0,
    totalUsd,
    marketUsd,
    originalMarketUsd: brakeBoost.originalMktAmount,
    limitUsd,
    executionUsd,
    emaDistancePercent: brakeBoost.emaDistancePercent,
    brakeBoostMode: brakeBoost.mode,
    brakeBoostFactor: brakeBoost.factor,
    brakeBoostReserveDelta: brakeBoost.reserveDelta,
    brakeBoostBadge: brakeBoost.badge,
    brakeBoostMatrix: brakeBoost.matrixLabel,
    marketShare,
    limitShare,
    limitPrice,
    discountPct: execution?.discountPct ?? 0,
    limitFallbackActive: execution?.fallbackActive ?? false,
    limitTargetLabel: execution?.targetLabel ?? "",
    limitBaseTarget: execution?.baseTarget ?? 0,
    qty,
    marketQty: price > 0 ? marketUsd / price : 0,
    limitQty: limitPrice > 0 ? limitUsd / limitPrice : 0,
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
    highBeta,
    highBetaRedirectedUsd,
    satellite,
    satelliteRedirectedUsd,
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
  const baseDeployedUsd = roundUsd(safeWeekly * (regime.allocationPercent / 100));
  const baseReserveUsd = roundUsd(Math.max(0, safeWeekly - baseDeployedUsd));
  let deployedUsd = baseDeployedUsd;

  const targetCorePct =
    allocationMode === "BTC_ONLY" ? 1 : moneyMode ? 0.52 : 0.55;
  let coreUsd = baseDeployedUsd * targetCorePct;
  coreUsd = Math.max(baseDeployedUsd * 0.5, coreUsd);
  if (allocationMode === "BTC_ONLY") coreUsd = baseDeployedUsd;
  coreUsd = roundUsd(Math.min(baseDeployedUsd, coreUsd));
  let altUsd = roundUsd(Math.max(0, baseDeployedUsd - coreUsd));

  const highBetaUniverse = DCA_TOKENS.filter((token) => token.category === "HIGH_BETA");
  const satelliteUniverse = DCA_TOKENS.filter((token) => token.category === "SATELLITE");

  const satCandidates = satelliteUniverse
    .map((token) => snapshots[token.symbol])
    .filter((snapshot): snapshot is TokenMarketSnapshot => {
      return Boolean(snapshot && snapshot.price > 0);
    });
  const betaCandidates = highBetaUniverse
    .map((token) => snapshots[token.symbol])
    .filter((snapshot): snapshot is TokenMarketSnapshot => {
      return Boolean(snapshot && snapshot.price > 0);
    });

  const betaBudget = allocationMode === "BTC_ONLY" ? 0 : altUsd * (moneyMode ? 0.28 : 0.18);
  const satBudget = Math.max(0, altUsd - betaBudget);

  const satDist = distribute(satCandidates, satBudget);
  const betaDist = distribute(betaCandidates, betaBudget);
  const unusedBeta = betaBudget - betaDist.reduce((sum, row) => sum + row.usd, 0);
  const unusedSat = satBudget - satDist.reduce((sum, row) => sum + row.usd, 0);
  coreUsd = roundUsd(coreUsd + Math.max(0, unusedBeta) + Math.max(0, unusedSat));

  const btcMacro = toHighBetaBtcData(btc);
  const highBetaVerdicts = new Map<DcaSymbol, HighBetaEvaluation>();
  for (const token of highBetaUniverse) {
    const snapshot = snapshots[token.symbol] ?? emptySnapshot(token.symbol);
    highBetaVerdicts.set(
      token.symbol,
      evaluateHighBetaToken(toHighBetaTokenData(snapshot), btcMacro),
    );
  }
  const satelliteVerdicts = new Map<DcaSymbol, SatelliteEvaluation>();
  for (const token of satelliteUniverse) {
    const snapshot = snapshots[token.symbol] ?? emptySnapshot(token.symbol);
    satelliteVerdicts.set(
      token.symbol,
      evaluateSatelliteToken(token.symbol, toSatelliteTokenData(snapshot), btcMacro),
    );
  }

  const bySymbol = new Map<DcaSymbol, number>();
  bySymbol.set("BTC", coreUsd);

  const redirectedBySymbol = new Map<DcaSymbol, number>();
  let satelliteRedirectedUsd = 0;
  const satellitePausedSymbols: DcaSymbol[] = [];
  for (const row of satDist) {
    const verdict = satelliteVerdicts.get(row.symbol);
    if (verdict && !verdict.approved) {
      const amount = roundUsd(row.usd);
      satelliteRedirectedUsd += amount;
      redirectedBySymbol.set(row.symbol, amount);
      bySymbol.set(row.symbol, 0);
      satellitePausedSymbols.push(row.symbol);
      continue;
    }
    bySymbol.set(row.symbol, (bySymbol.get(row.symbol) ?? 0) + row.usd);
  }
  for (const token of satelliteUniverse) {
    const verdict = satelliteVerdicts.get(token.symbol);
    if (verdict && !verdict.approved && !satellitePausedSymbols.includes(token.symbol)) {
      satellitePausedSymbols.push(token.symbol);
    }
  }
  satelliteRedirectedUsd = roundUsd(satelliteRedirectedUsd);
  coreUsd = roundUsd(Math.min(baseDeployedUsd, coreUsd + satelliteRedirectedUsd));
  bySymbol.set("BTC", coreUsd);

  let highBetaRedirectedUsd = 0;
  const highBetaRejectedSymbols: DcaSymbol[] = [];
  for (const row of betaDist) {
    const verdict = highBetaVerdicts.get(row.symbol);
    if (verdict && !verdict.approved) {
      const amount = roundUsd(row.usd);
      highBetaRedirectedUsd += amount;
      redirectedBySymbol.set(row.symbol, amount);
      bySymbol.set(row.symbol, 0);
      highBetaRejectedSymbols.push(row.symbol);
      continue;
    }
    bySymbol.set(row.symbol, (bySymbol.get(row.symbol) ?? 0) + row.usd);
  }
  for (const token of highBetaUniverse) {
    const verdict = highBetaVerdicts.get(token.symbol);
    if (verdict && !verdict.approved && !highBetaRejectedSymbols.includes(token.symbol)) {
      highBetaRejectedSymbols.push(token.symbol);
    }
  }
  highBetaRedirectedUsd = roundUsd(highBetaRedirectedUsd);
  coreUsd = roundUsd(Math.min(baseDeployedUsd, coreUsd + highBetaRedirectedUsd));
  bySymbol.set("BTC", coreUsd);
  altUsd = roundUsd(Math.max(0, baseDeployedUsd - coreUsd));

  const plans = DCA_TOKENS.map((meta) => {
    const snapshot = snapshots[meta.symbol] ?? emptySnapshot(meta.symbol);
    const usd = bySymbol.get(meta.symbol) ?? 0;
    return buildPlan(
      snapshot,
      usd,
      safeWeekly,
      moneyMode,
      false,
      highBetaVerdicts.get(meta.symbol) ?? null,
      meta.category === "HIGH_BETA" ? (redirectedBySymbol.get(meta.symbol) ?? 0) : 0,
      satelliteVerdicts.get(meta.symbol) ?? null,
      meta.category === "SATELLITE" ? (redirectedBySymbol.get(meta.symbol) ?? 0) : 0,
    );
  }).filter(
    (plan) =>
      plan.totalUsd > 0 ||
      plan.symbol === "BTC" ||
      plan.category === "HIGH_BETA" ||
      plan.category === "SATELLITE",
  );

  const btcPlan = plans.find((plan) => plan.symbol === "BTC");
  const btcFloorSatisfied =
    baseDeployedUsd <= 0 ||
    ((btcPlan?.totalUsd ?? 0) / Math.max(baseDeployedUsd, 1)) >= 0.5;

  const brakeBoostReserveDelta = roundUsd(
    plans.reduce((sum, plan) => sum + plan.brakeBoostReserveDelta, 0),
  );
  const reserveUsd = roundUsd(baseReserveUsd + brakeBoostReserveDelta);
  deployedUsd = roundUsd(baseDeployedUsd - brakeBoostReserveDelta);

  const corePercent = baseDeployedUsd > 0 ? (coreUsd / baseDeployedUsd) * 100 : 0;
  const altPercent = 100 - corePercent;

  const allocationLabel =
    corePercent >= 62 ? "CONSERVATIVE" : corePercent <= 52 ? "AGGRESSIVE" : "BALANCED";
  const allocationSubtitle =
    allocationLabel === "BALANCED"
      ? "Vyvážená alokácia"
      : allocationLabel === "CONSERVATIVE"
        ? "Konzervatívna alokácia"
        : "Agresívnejšia alokácia";

  const approvedBeta = highBetaUniverse
    .map((token) => token.symbol)
    .filter((symbol) => highBetaVerdicts.get(symbol)?.approved);
  const approvedSats = satelliteUniverse
    .map((token) => token.symbol)
    .filter((symbol) => satelliteVerdicts.get(symbol)?.approved);

  const narrative = [
    `BTC Core drží ${corePercent.toFixed(0)}% nasadeného kapitálu (floor 50%).`,
    allocationMode === "BTC_ONLY"
      ? "Režim BTC ONLY posiela celý nákup do Bitcoinu."
      : "Satelity (ETH, SOL, LINK, AAVE, UNI) idú cez Smart DCA protokol; LINK má výnimku z brzdy eufórie.",
    satellitePausedSymbols.length > 0
      ? `Smart DCA pozastavil ${satellitePausedSymbols.join(", ")}: ${satelliteRedirectedUsd.toFixed(0)}$ presmerovaných do Core (BTC).`
      : approvedSats.length > 0
        ? `Smart DCA schválil ${approvedSats.join(", ")}.`
        : "Satelitná vrstva čaká na live dáta protokolu.",
    highBetaRejectedSymbols.length > 0
      ? `High-Beta protokol zamietol ${highBetaRejectedSymbols.join(", ")}: ${highBetaRedirectedUsd.toFixed(0)}$ presmerovaných do Core (BTC).`
      : approvedBeta.length > 0
        ? `High-Beta protokol schválil ${approvedBeta.join(", ")}.`
        : "High-beta vrstva čaká na live dáta protokolu.",
    "Schválené tokeny idú cez univerzálny engine: MKT% = clamp(10–90, 90 − ((RSI−30)×2)), limit podľa kategórie, ochrana Live − 1.5× ATR, platnosť 7 dní.",
    "Brzda & Boost mení len MKT podľa vzdialenosti od 50D EMA. Ušetrený MKT ide do Hotovosť rezervy, extra MKT sa z rezervy berie — nikdy do BTC. LMT ostáva z Phase 6.",
    "Váhy sa menia dynamicky podľa Value, Trend, Sentiment, Momentum a Risk.",
  ];

  return {
    regime,
    deployedUsd,
    reserveUsd,
    brakeBoostReserveDelta,
    weeklyAmount: safeWeekly,
    coreUsd,
    altUsd,
    corePercent,
    altPercent,
    btcFloorSatisfied,
    stoppedSymbols: [],
    highBetaRejectedSymbols,
    highBetaRedirectedUsd,
    satellitePausedSymbols,
    satelliteRedirectedUsd,
    plans,
    narrative,
    allocationLabel,
    allocationSubtitle,
  };
}
