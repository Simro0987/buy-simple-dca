import { computeAvailableCapital } from "@/lib/dca/capitalPool";
import {
  applyInverseRsiWaterfall,
  buildConfluenceBrain,
  EMPTY_REGIME_METRICS,
} from "@/lib/dca/confluence";
import {
  applyDeploymentCapital,
  calculateDeploymentScore,
} from "@/lib/dca/deployment";
import {
  applyBrakeBoost,
  computeUniversalExecution,
  statusFromRsi,
} from "@/lib/dca/executionMath";
import { evaluateFallingKnife } from "@/lib/dca/fallingKnife";
import { buildFlashCrashPlan, detectFlashCrash } from "@/lib/dca/flashCrash";
import { evaluateHighBetaToken } from "@/lib/dca/highBetaProtocol";
import { clamp, roundUsd } from "@/lib/dca/math";
import { evaluateSatelliteToken } from "@/lib/dca/satelliteProtocol";
import { recommendSmartTrim } from "@/lib/dca/smartTrim";
import { buildTokenGate } from "@/lib/dca/tokenGate";
import type {
  AllocationMode,
  DcaSymbol,
  HighBetaBtcData,
  HighBetaEvaluation,
  HighBetaTokenData,
  Phase12Sim,
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
  deployedCapital: number,
  moneyMode: boolean,
  stopped: boolean,
  highBeta: HighBetaEvaluation | null,
  highBetaRedirectedUsd: number,
  satellite: SatelliteEvaluation | null,
  satelliteRedirectedUsd: number,
  waterfallDestination: string,
  extras: {
    absorbedUsd: number;
    basketWeightPercent: number;
    fallingKnife: boolean;
    smartTrim: TokenExecutionPlan["smartTrim"];
  },
): TokenExecutionPlan {
  const meta = TOKEN_BY_SYMBOL[snapshot.symbol];
  const ind = snapshot.indicators;
  const rsi = ind?.rsi ?? 50;
  const price = snapshot.price;
  const totalUsd = roundUsd(usd);
  const locked = Boolean(
    extras.fallingKnife ||
      (highBeta && !highBeta.approved) ||
      (satellite && !satellite.approved),
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
  const gate = buildTokenGate({
    fallingKnife: extras.fallingKnife,
    highBeta,
    satellite,
    price,
    ema50: ind?.ema50 ?? 0,
    sma200: ind?.sma200 ?? 0,
  });
  void moneyMode;

  return {
    symbol: snapshot.symbol,
    name: meta.name,
    category: meta.category,
    subTags: meta.subTags,
    weightPercent: deployedCapital > 0 ? (totalUsd / deployedCapital) * 100 : 0,
    totalUsd,
    marketUsd,
    originalMarketUsd: brakeBoost.originalMktAmount,
    limitUsd,
    limit1Usd: limitUsd,
    limit2Usd: 0,
    limit2Skipped: true,
    limit2SkipReason: "",
    lmt2Share: 0,
    limit1AtrMult: 1.5,
    limit2AtrMult: 0,
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
    limit1Price: limitPrice,
    limit2Price: 0,
    discountPct: execution?.discountPct ?? 0,
    limitFallbackActive: execution?.fallbackActive ?? false,
    limit1FallbackActive: execution?.fallbackActive ?? false,
    limit2FallbackActive: false,
    limitTargetLabel: execution?.targetLabel ?? "",
    limit1TargetLabel: execution?.targetLabel ?? "",
    limit2TargetLabel: "",
    limitBaseTarget: execution?.baseTarget ?? 0,
    qty,
    marketQty: price > 0 ? marketUsd / price : 0,
    limitQty: limitPrice > 0 ? limitUsd / limitPrice : 0,
    limit1Qty: limitPrice > 0 ? limitUsd / limitPrice : 0,
    limit2Qty: 0,
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
    stopped: extras.fallingKnife || stopped,
    highBeta,
    highBetaRedirectedUsd,
    satellite,
    satelliteRedirectedUsd,
    waterfallDestination,
    absorbedUsd: extras.absorbedUsd,
    basketWeightPercent: extras.basketWeightPercent,
    gate,
    fallingKnife: extras.fallingKnife,
    smartTrim: extras.smartTrim,
  };
}

function overlaySimSnapshot(
  snapshot: TokenMarketSnapshot,
  sim: Phase12Sim,
): TokenMarketSnapshot {
  if (sim === "knife" && snapshot.symbol === "LINK") {
    const indicators = snapshot.indicators
      ? { ...snapshot.indicators, rsi: 12, sma200DevPct: -24 }
      : snapshot.indicators;
    return { ...snapshot, indicators };
  }
  if (sim === "trim" && snapshot.symbol === "ETH") {
    const indicators = snapshot.indicators
      ? { ...snapshot.indicators, rsi: 88 }
      : snapshot.indicators;
    return { ...snapshot, indicators };
  }
  return snapshot;
}

export function buildWeeklyDcaPlan(options: {
  weeklyAmount: number;
  moneyMode: boolean;
  allocationMode: AllocationMode;
  snapshots: Partial<Record<DcaSymbol, TokenMarketSnapshot>>;
  regimeMetrics?: RegimeMetrics;
  allocationOverride?: number | null;
  knifeLatched?: Partial<Record<DcaSymbol, boolean>>;
  sim?: Phase12Sim;
  holdings?: Partial<Record<string, number>>;
}): WeeklyDcaPlan {
  const { weeklyAmount, moneyMode, allocationMode } = options;
  const sim = options.sim ?? "off";
  const snapshots: Partial<Record<DcaSymbol, TokenMarketSnapshot>> = {};
  for (const [symbol, row] of Object.entries(options.snapshots) as Array<
    [DcaSymbol, TokenMarketSnapshot | undefined]
  >) {
    if (row) snapshots[symbol] = overlaySimSnapshot(row, sim);
  }
  const btc = snapshots.BTC;
  const metrics = options.regimeMetrics ?? EMPTY_REGIME_METRICS;
  const brain = buildConfluenceBrain(btc, metrics);
  const deployment = calculateDeploymentScore(btc, metrics, moneyMode);
  const override = options.allocationOverride;
  const engineAllocationPercent = deployment.allocationPercent;
  const allocationPercent =
    override != null && Number.isFinite(override)
      ? clamp(override, 0, 100)
      : engineAllocationPercent;

  const baseAmount = Math.max(0, weeklyAmount);
  const { deployedCapital, undeployedToReserve } = applyDeploymentCapital(
    baseAmount,
    allocationPercent,
  );
  const baseDeployedUsd = deployedCapital;
  const baseReserveUsd = undeployedToReserve;
  let deployedUsd = baseDeployedUsd;

  const mix =
    allocationMode === "BTC_ONLY"
      ? { corePercent: 100, satellitePercent: 0, highBetaPercent: 0 }
      : brain.basket;
  let coreUsd = roundUsd(baseDeployedUsd * (mix.corePercent / 100));
  let satBudget = roundUsd(baseDeployedUsd * (mix.satellitePercent / 100));
  let betaBudget = roundUsd(baseDeployedUsd - coreUsd - satBudget);
  if (allocationMode === "BTC_ONLY") {
    coreUsd = baseDeployedUsd;
    satBudget = 0;
    betaBudget = 0;
  }

  const regime = {
    kind: deployment.kind,
    englishKind: deployment.englishKind,
    label: deployment.label,
    description: deployment.description,
    finalScore: deployment.score,
    allocationPercent,
    confidence: deployment.confidence,
    confidenceMultiplier: deployment.confidenceMultiplier,
    confluenceScore: brain.score,
    confluenceIndicators: brain.indicators,
    factors: deployment.factors,
    blend: deployment.blend,
    deploymentBlend: deployment.blend,
    deploymentNotes: deployment.notes,
    basket: mix,
    safeHaven: brain.safeHaven,
  };

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

  const knifeLatched = options.knifeLatched ?? {};
  const knifeBySymbol = new Map<DcaSymbol, boolean>();
  for (const token of DCA_TOKENS) {
    const snapshot = snapshots[token.symbol] ?? emptySnapshot(token.symbol);
    const rsi = snapshot.indicators?.rsi ?? 50;
    const smaDev = snapshot.indicators?.sma200DevPct ?? 0;
    const forcedKnife = sim === "knife" && token.symbol === "LINK";
    const verdict = evaluateFallingKnife({
      rsi: forcedKnife ? 12 : rsi,
      sma200DevPct: forcedKnife ? -24 : smaDev,
      latched: Boolean(knifeLatched[token.symbol]) || forcedKnife,
    });
    knifeBySymbol.set(token.symbol, verdict.active);
  }

  const satWaterfall = applyInverseRsiWaterfall(
    satBudget,
    satelliteUniverse.map((token) => ({
      symbol: token.symbol,
      approved:
        Boolean(satelliteVerdicts.get(token.symbol)?.approved) &&
        !knifeBySymbol.get(token.symbol),
      priced: (snapshots[token.symbol]?.price ?? 0) > 0,
      rsi: snapshots[token.symbol]?.indicators?.rsi ?? 50,
    })),
    "satelitný",
  );
  const betaWaterfall = applyInverseRsiWaterfall(
    betaBudget,
    highBetaUniverse.map((token) => ({
      symbol: token.symbol,
      approved:
        Boolean(highBetaVerdicts.get(token.symbol)?.approved) &&
        !knifeBySymbol.get(token.symbol),
      priced: (snapshots[token.symbol]?.price ?? 0) > 0,
      rsi: snapshots[token.symbol]?.indicators?.rsi ?? 50,
    })),
    "high-beta",
  );

  const leftoverWaterfallUsd = roundUsd(
    (satWaterfall.mode === "full" ? satBudget : 0) +
      (betaWaterfall.mode === "full" ? betaBudget : 0) +
      (knifeBySymbol.get("BTC") ? coreUsd : 0),
  );

  const bySymbol = new Map<DcaSymbol, number>();
  bySymbol.set("BTC", knifeBySymbol.get("BTC") ? 0 : coreUsd);
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
    const knifed = Boolean(knifeBySymbol.get(token.symbol));
    if ((verdict && !verdict.approved) || knifed) {
      satellitePausedSymbols.push(token.symbol);
      redirectedBySymbol.set(token.symbol, satWaterfall.mode === "none" ? 0 : satUnit);
      waterfallBySymbol.set(
        token.symbol,
        satWaterfall.mode === "full"
          ? "Dostupný Kapitál"
          : satWaterfall.toSymbols.join(", ") || "Dostupný Kapitál",
      );
    }
  }
  const highBetaRejectedSymbols: DcaSymbol[] = [];
  for (const token of highBetaUniverse) {
    const verdict = highBetaVerdicts.get(token.symbol);
    const knifed = Boolean(knifeBySymbol.get(token.symbol));
    if ((verdict && !verdict.approved) || knifed) {
      highBetaRejectedSymbols.push(token.symbol);
      redirectedBySymbol.set(token.symbol, betaWaterfall.mode === "none" ? 0 : betaUnit);
      waterfallBySymbol.set(
        token.symbol,
        betaWaterfall.mode === "full"
          ? "Dostupný Kapitál"
          : betaWaterfall.toSymbols.join(", ") || "Dostupný Kapitál",
      );
    }
  }

  const satelliteRedirectedUsd = satWaterfall.redirectedUsd;
  const highBetaRedirectedUsd = betaWaterfall.redirectedUsd;
  let altUsd = roundUsd(
    Math.max(0, baseDeployedUsd - (bySymbol.get("BTC") ?? 0)),
  );

  const moduleConfluence = sim === "trim" ? 88 : sim === "flash" ? 18 : brain.score;
  const holdings = options.holdings ?? {};

  const plans = DCA_TOKENS.map((meta) => {
    const snapshot = snapshots[meta.symbol] ?? emptySnapshot(meta.symbol);
    const usd = bySymbol.get(meta.symbol) ?? 0;
    const fallingKnife = Boolean(knifeBySymbol.get(meta.symbol));
    const waterfall =
      meta.category === "SATELLITE"
        ? satWaterfall
        : meta.category === "HIGH_BETA"
          ? betaWaterfall
          : null;
    return buildPlan(
      snapshot,
      usd,
      baseDeployedUsd,
      moneyMode,
      fallingKnife,
      highBetaVerdicts.get(meta.symbol) ?? null,
      meta.category === "HIGH_BETA" ? (redirectedBySymbol.get(meta.symbol) ?? 0) : 0,
      satelliteVerdicts.get(meta.symbol) ?? null,
      meta.category === "SATELLITE" ? (redirectedBySymbol.get(meta.symbol) ?? 0) : 0,
      waterfallBySymbol.get(meta.symbol) ?? "",
      {
        absorbedUsd: waterfall?.absorbed.get(meta.symbol) ?? 0,
        basketWeightPercent: waterfall?.weights.get(meta.symbol) ?? (meta.symbol === "BTC" ? 100 : 0),
        fallingKnife,
        smartTrim: recommendSmartTrim({
          confluence: moduleConfluence,
          rsi: snapshot.indicators?.rsi ?? 50,
          symbol: meta.symbol,
          price: snapshot.price,
          holdingQty: holdings[meta.symbol] ?? 0,
          forced: sim === "trim" && meta.symbol === "ETH",
        }),
      },
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
    Boolean(knifeBySymbol.get("BTC")) ||
    baseDeployedUsd <= 0 ||
    ((btcPlan?.totalUsd ?? 0) / Math.max(baseDeployedUsd, 1)) >= 0.5;

  const brakeBoostReserveDelta = roundUsd(
    plans.reduce((sum, plan) => sum + plan.brakeBoostReserveDelta, 0),
  );
  const reserveUsd = roundUsd(baseReserveUsd + leftoverWaterfallUsd + brakeBoostReserveDelta);
  const availableCapital = computeAvailableCapital({
    undeployedUsd: baseReserveUsd,
    leftoverWaterfallUsd,
    brakeBoostReserveDelta,
    cashUsd: 0,
    executionImpactUsd: 0,
  });
  deployedUsd = roundUsd(baseDeployedUsd - leftoverWaterfallUsd - brakeBoostReserveDelta);

  coreUsd = bySymbol.get("BTC") ?? coreUsd;
  altUsd = roundUsd(Math.max(0, baseDeployedUsd - coreUsd));
  const corePercent = baseDeployedUsd > 0 ? (coreUsd / baseDeployedUsd) * 100 : 0;
  const altPercent = 100 - corePercent;

  const allocationLabel =
    regime.kind === "PANIC" || regime.kind === "BEAR"
      ? "CONSERVATIVE"
      : regime.kind === "EUPHORIA"
        ? "AGGRESSIVE"
        : "BALANCED";
  const allocationSubtitle =
    allocationLabel === "BALANCED"
      ? `Vyvážená alokácia · ${regime.label}`
      : allocationLabel === "CONSERVATIVE"
        ? `Konzervatívna alokácia · ${regime.label}`
        : `Agresívnejšia alokácia · ${regime.label}`;

  const approvedBeta = highBetaUniverse
    .map((token) => token.symbol)
    .filter((symbol) => highBetaVerdicts.get(symbol)?.approved);
  const approvedSats = satelliteUniverse
    .map((token) => token.symbol)
    .filter((symbol) => satelliteVerdicts.get(symbol)?.approved);

  const narrative = [
    `Fáza A · Koľko: 5 faktorov (Valuácia/Trend/Sentiment/Momentum/Riziko) → Final Score ${deployment.score}/100 → Alokácia ${allocationPercent.toFixed(0)}% z ${baseAmount.toFixed(0)}$ = nasadené ${deployedCapital.toFixed(2)}$ · Dostupný Kapitál ${undeployedToReserve.toFixed(2)}$.`,
    `Fáza B · Ako rozdeliť: CONFLUENCE ${brain.score}/100 (200 WMA · Fear & Greed · Likvidita · ATR · CBBI) z nasadeného kapitálu → Core ${mix.corePercent.toFixed(0)}% · Satelity ${mix.satellitePercent.toFixed(0)}% · High-Beta ${mix.highBetaPercent.toFixed(0)}% (Core ≥ 50% nasadeného). Inverse RSI v koši: Weight = 100 − RSI.`,
    allocationMode === "BTC_ONLY"
      ? "Režim BTC ONLY posiela celý nasadený kapitál do Bitcoinu."
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
    "Waterfall C: REDUCE, zrušené / expirované LMT a koše bez PASS tokenov idú do Dostupný Kapitál — nikdy do tokenov.",
    `Váhy faktorov sa plynulo miešajú cez režimy (${regime.blend
      .map((row) => `${row.label} ${row.percent.toFixed(0)}%`)
      .join(" · ") || regime.label}).`,
    "Schválené tokeny idú cez univerzálny engine: MKT% = clamp(10–90, 90 − ((RSI−30)×2)), LMT = 100 − MKT, jeden limit, platnosť 7 dní.",
    "Brzda & Boost mení len MKT podľa vzdialenosti od 50D EMA. Ušetrený MKT ide do Dostupný Kapitál, extra MKT sa z poolu berie — nikdy do BTC.",
  ];

  return {
    regime,
    baseAmount,
    deploymentScore: deployment.score,
    allocationPercent,
    engineAllocationPercent,
    deployedCapital,
    undeployedToReserve,
    availableCapital,
    leftoverWaterfallUsd,
    confluence: sim === "flash" ? 18 : sim === "trim" ? 88 : regime.confluenceScore,
    basketSplits: mix,
    finalBudgets: {
      coreUsd: roundUsd(baseDeployedUsd * (mix.corePercent / 100)),
      satelliteUsd: satBudget,
      highBetaUsd: betaBudget,
    },
    deployedUsd,
    reserveUsd,
    brakeBoostReserveDelta,
    flashCrash: buildFlashCrashPlan({
      active: detectFlashCrash({
        btcChange24h: sim === "flash" ? -16 : (btc?.change24h ?? 0),
        confluence: moduleConfluence,
        forced: sim === "flash",
      }),
      availableCapital,
      plans,
    }),
    weeklyAmount: baseAmount,
    coreUsd,
    altUsd,
    corePercent,
    altPercent,
    btcFloorSatisfied,
    stoppedSymbols: DCA_TOKENS.map((token) => token.symbol).filter((symbol) =>
      knifeBySymbol.get(symbol),
    ),
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
