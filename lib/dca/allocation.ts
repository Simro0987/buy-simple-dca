import {
  applyEqualWaterfall,
  buildConfluenceRegime,
  EMPTY_REGIME_METRICS,
} from "@/lib/dca/confluence";
import {
  applyBrakeBoost,
  computeUniversalExecution,
  statusFromRsi,
} from "@/lib/dca/executionMath";
import { evaluateHighBetaToken } from "@/lib/dca/highBetaProtocol";
import { clamp, roundUsd } from "@/lib/dca/math";
import { evaluateSatelliteToken } from "@/lib/dca/satelliteProtocol";
import type {
  AllocationMode,
  DcaSymbol,
  HighBetaBtcData,
  HighBetaEvaluation,
  HighBetaTokenData,
  RegimeMetrics,
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
  waterfallDestination: string,
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
    waterfallDestination,
  };
}

export function buildWeeklyDcaPlan(options: {
  weeklyAmount: number;
  moneyMode: boolean;
  allocationMode: AllocationMode;
  snapshots: Partial<Record<DcaSymbol, TokenMarketSnapshot>>;
  regimeMetrics?: RegimeMetrics;
}): WeeklyDcaPlan {
  const { weeklyAmount, moneyMode, allocationMode, snapshots } = options;
  const btc = snapshots.BTC;
  const regime = buildConfluenceRegime(
    btc,
    options.regimeMetrics ?? EMPTY_REGIME_METRICS,
    moneyMode,
  );
  const safeWeekly = Math.max(0, weeklyAmount);
  const baseDeployedUsd = roundUsd(safeWeekly);
  const baseReserveUsd = 0;
  let deployedUsd = baseDeployedUsd;

  const mix =
    allocationMode === "BTC_ONLY"
      ? { corePercent: 100, satellitePercent: 0, highBetaPercent: 0 }
      : regime.basket;
  let coreUsd = roundUsd(baseDeployedUsd * (mix.corePercent / 100));
  let satBudget = roundUsd(baseDeployedUsd * (mix.satellitePercent / 100));
  let betaBudget = roundUsd(baseDeployedUsd - coreUsd - satBudget);
  if (allocationMode === "BTC_ONLY") {
    coreUsd = baseDeployedUsd;
    satBudget = 0;
    betaBudget = 0;
  }

  const highBetaUniverse = DCA_TOKENS.filter((token) => token.category === "HIGH_BETA");
  const satelliteUniverse = DCA_TOKENS.filter((token) => token.category === "SATELLITE");

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

  const satWaterfall = applyEqualWaterfall(
    satBudget,
    satelliteUniverse.map((token) => ({
      symbol: token.symbol,
      approved: Boolean(satelliteVerdicts.get(token.symbol)?.approved),
      priced: (snapshots[token.symbol]?.price ?? 0) > 0,
    })),
    "satelitný",
  );
  const betaWaterfall = applyEqualWaterfall(
    betaBudget,
    highBetaUniverse.map((token) => ({
      symbol: token.symbol,
      approved: Boolean(highBetaVerdicts.get(token.symbol)?.approved),
      priced: (snapshots[token.symbol]?.price ?? 0) > 0,
    })),
    "high-beta",
  );

  if (satWaterfall.mode === "full") coreUsd = roundUsd(coreUsd + satBudget);
  if (betaWaterfall.mode === "full") coreUsd = roundUsd(coreUsd + betaBudget);

  const bySymbol = new Map<DcaSymbol, number>();
  bySymbol.set("BTC", coreUsd);
  for (const token of satelliteUniverse) {
    bySymbol.set(token.symbol, satWaterfall.amounts.get(token.symbol) ?? 0);
  }
  for (const token of highBetaUniverse) {
    bySymbol.set(token.symbol, betaWaterfall.amounts.get(token.symbol) ?? 0);
  }

  const originalSatShare = satelliteUniverse.filter((token) => (snapshots[token.symbol]?.price ?? 0) > 0).length;
  const originalBetaShare = highBetaUniverse.filter((token) => (snapshots[token.symbol]?.price ?? 0) > 0).length;
  const satUnit = originalSatShare > 0 ? roundUsd(satBudget / originalSatShare) : 0;
  const betaUnit = originalBetaShare > 0 ? roundUsd(betaBudget / originalBetaShare) : 0;

  const redirectedBySymbol = new Map<DcaSymbol, number>();
  const waterfallBySymbol = new Map<DcaSymbol, string>();
  const satellitePausedSymbols: DcaSymbol[] = [];
  for (const token of satelliteUniverse) {
    const verdict = satelliteVerdicts.get(token.symbol);
    if (verdict && !verdict.approved) {
      satellitePausedSymbols.push(token.symbol);
      redirectedBySymbol.set(token.symbol, satWaterfall.mode === "none" ? 0 : satUnit);
      waterfallBySymbol.set(
        token.symbol,
        satWaterfall.mode === "full"
          ? "Core (BTC)"
          : satWaterfall.toSymbols.join(", ") || "Core (BTC)",
      );
    }
  }
  const highBetaRejectedSymbols: DcaSymbol[] = [];
  for (const token of highBetaUniverse) {
    const verdict = highBetaVerdicts.get(token.symbol);
    if (verdict && !verdict.approved) {
      highBetaRejectedSymbols.push(token.symbol);
      redirectedBySymbol.set(token.symbol, betaWaterfall.mode === "none" ? 0 : betaUnit);
      waterfallBySymbol.set(
        token.symbol,
        betaWaterfall.mode === "full"
          ? "Core (BTC)"
          : betaWaterfall.toSymbols.join(", ") || "Core (BTC)",
      );
    }
  }

  const satelliteRedirectedUsd = satWaterfall.redirectedUsd;
  const highBetaRedirectedUsd = betaWaterfall.redirectedUsd;
  let altUsd = roundUsd(
    Math.max(0, baseDeployedUsd - (bySymbol.get("BTC") ?? 0)),
  );

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
      waterfallBySymbol.get(meta.symbol) ?? "",
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

  coreUsd = bySymbol.get("BTC") ?? coreUsd;
  altUsd = roundUsd(Math.max(0, baseDeployedUsd - coreUsd));
  const corePercent = baseDeployedUsd > 0 ? (coreUsd / baseDeployedUsd) * 100 : 0;
  const altPercent = 100 - corePercent;

  const allocationLabel =
    regime.kind === "FEAR"
      ? "CONSERVATIVE"
      : regime.kind === "NEUTRAL"
        ? "BALANCED"
        : "AGGRESSIVE";
  const allocationSubtitle =
    allocationLabel === "BALANCED"
      ? "Vyvážená alokácia · CONFLUENCE"
      : allocationLabel === "CONSERVATIVE"
        ? "Konzervatívna alokácia · strach"
        : "Agresívnejšia alokácia · eufória";

  const approvedBeta = highBetaUniverse
    .map((token) => token.symbol)
    .filter((symbol) => highBetaVerdicts.get(symbol)?.approved);
  const approvedSats = satelliteUniverse
    .map((token) => token.symbol)
    .filter((symbol) => satelliteVerdicts.get(symbol)?.approved);

  const narrative = [
    `CONFLUENCE ${regime.finalScore}/100 → Core ${mix.corePercent.toFixed(0)}% · Satelity ${mix.satellitePercent.toFixed(0)}% · High-Beta ${mix.highBetaPercent.toFixed(0)}% (plynulá krivka, High-Beta strop 25%).`,
    allocationMode === "BTC_ONLY"
      ? "Režim BTC ONLY posiela celý nákup do Bitcoinu."
      : "Satelity (ETH, SOL, LINK, AAVE, UNI) idú cez Smart DCA protokol; LINK má výnimku z brzdy eufórie.",
    satWaterfall.mode === "partial"
      ? `Waterfall A: ${satWaterfall.note}`
      : satWaterfall.mode === "full"
        ? `Waterfall B: ${satWaterfall.note}`
        : approvedSats.length > 0
          ? `Smart DCA schválil ${approvedSats.join(", ")}.`
          : "Satelitná vrstva čaká na live dáta protokolu.",
    betaWaterfall.mode === "partial"
      ? `Waterfall A: ${betaWaterfall.note}`
      : betaWaterfall.mode === "full"
        ? `Waterfall B: ${betaWaterfall.note}`
        : approvedBeta.length > 0
          ? `High-Beta protokol schválil ${approvedBeta.join(", ")}.`
          : "High-beta vrstva čaká na live dáta protokolu.",
    "Waterfall C: REDUCE (Phase 7) a expirované 7-dňové LMT (Phase 8) idú len do Hotovosť rezervy — nikdy waterfall do tokenov ani BTC.",
    "Schválené tokeny idú cez univerzálny engine: MKT% = clamp(10–90, 90 − ((RSI−30)×2)), limit podľa kategórie, ochrana Live − 1.5× ATR, platnosť 7 dní.",
    "Brzda & Boost mení len MKT podľa vzdialenosti od 50D EMA. Ušetrený MKT ide do Hotovosť rezervy, extra MKT sa z rezervy berie — nikdy do BTC. LMT ostáva z Phase 6.",
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
    targetCorePercent: mix.corePercent,
    targetSatellitePercent: mix.satellitePercent,
    targetHighBetaPercent: mix.highBetaPercent,
    satelliteBasketUsd: satBudget,
    highBetaBasketUsd: betaBudget,
    satelliteWaterfallMode: satWaterfall.mode,
    highBetaWaterfallMode: betaWaterfall.mode,
    satelliteWaterfallNote: satWaterfall.note,
    highBetaWaterfallNote: betaWaterfall.note,
    plans,
    narrative,
    allocationLabel,
    allocationSubtitle,
  };
}
