import { ATR } from "technicalindicators";
import { computeSma } from "@/lib/dca/indicators";
import { clamp, lerp, roundUsd, smoothstep, softmax } from "@/lib/dca/math";
import type {
  BasketMix,
  DcaSymbol,
  FactorBreakdown,
  MarketRegime,
  RegimeBlendShare,
  RegimeFactorId,
  RegimeKind,
  RegimeMetrics,
  TokenMarketSnapshot,
  WaterfallMode,
} from "@/lib/dca/types";

/** SIDEWAYS baseline (~user spec). Other regimes interpolate from these tables. */
export const FACTOR_WEIGHTS = {
  valuation: 0.3,
  trend: 0.2,
  sentiment: 0.2,
  momentum: 0.15,
  risk: 0.15,
} as const;

const REGIME_WEIGHTS: Record<
  RegimeKind,
  Record<RegimeFactorId, number>
> = {
  PANIC: { valuation: 0.22, trend: 0.12, sentiment: 0.28, momentum: 0.13, risk: 0.25 },
  BEAR: { valuation: 0.38, trend: 0.22, sentiment: 0.14, momentum: 0.1, risk: 0.16 },
  SIDEWAYS: { ...FACTOR_WEIGHTS },
  BULL: { valuation: 0.24, trend: 0.28, sentiment: 0.16, momentum: 0.2, risk: 0.12 },
  EUPHORIA: { valuation: 0.34, trend: 0.14, sentiment: 0.26, momentum: 0.1, risk: 0.16 },
};

const REGIME_COPY: Record<
  RegimeKind,
  { english: string; label: string; description: string }
> = {
  PANIC: { english: "PANIC", label: "PANIKA", description: "Extrémny strach a volatilita" },
  BEAR: { english: "BEAR", label: "MEDVEĎ", description: "Medvedí trend" },
  SIDEWAYS: { english: "SIDEWAYS", label: "STRANA", description: "Bočný pohyb" },
  BULL: { english: "BULL", label: "BÝK", description: "Býčí trend" },
  EUPHORIA: { english: "EUPHORIA", label: "EUFÓRIA", description: "Rizikový apetít na maxime" },
};

const REGIME_ORDER: RegimeKind[] = ["PANIC", "BEAR", "SIDEWAYS", "BULL", "EUPHORIA"];
const SOFTMAX_TEMPERATURE = 16;

export const SAFE_HAVEN_THRESHOLD = 85;

export const SAFE_HAVEN_COPY =
  "⚠️ TRH JE V EXTRÉMNEJ EUFÓRII. Zvážte manuálne presmerovanie 20 % – 30 % týždenného vkladu do stabilných výnosov (napr. sUSDe, sUSDS) alebo tokenizovaného zlata (PAXG) na vybudovanie rezerv (Dry Powder).";

const BASKET_ANCHORS: Array<{ c: number } & BasketMix> = [
  { c: 0, corePercent: 80, satellitePercent: 20, highBetaPercent: 0 },
  { c: 30, corePercent: 75, satellitePercent: 25, highBetaPercent: 0 },
  { c: 50, corePercent: 56, satellitePercent: 31, highBetaPercent: 13 },
  { c: 55, corePercent: 54, satellitePercent: 32, highBetaPercent: 14 },
  { c: 65, corePercent: 48, satellitePercent: 35, highBetaPercent: 17 },
  { c: 75, corePercent: 40, satellitePercent: 38, highBetaPercent: 22 },
  { c: 85, corePercent: 35, satellitePercent: 40, highBetaPercent: 25 },
  { c: 100, corePercent: 32, satellitePercent: 43, highBetaPercent: 25 },
];

function mapRange(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number,
): number {
  if (!Number.isFinite(value)) return (toLow + toHigh) / 2;
  const t = (value - fromLow) / (fromHigh - fromLow);
  return lerp(toLow, toHigh, t);
}

function lastAtrPercent(candles: TokenMarketSnapshot["dailyCandles"], price: number): number {
  if (!(price > 0) || candles.length < 20) return Number.NaN;
  const period = candles.length >= 45 ? 30 : 14;
  const series = ATR.calculate({
    period,
    high: candles.map((candle) => candle.high),
    low: candles.map((candle) => candle.low),
    close: candles.map((candle) => candle.close),
  });
  const atr = series[series.length - 1];
  if (!(atr > 0)) return Number.NaN;
  return (atr / price) * 100;
}

function wmaScore(btc: TokenMarketSnapshot | undefined): { score: number; note: string; source: FactorBreakdown["source"] } {
  const price = btc?.price ?? 0;
  const weekly = btc?.weeklyCandles ?? [];
  const sma200w = computeSma(weekly.map((candle) => candle.close), 200);
  if (!(price > 0) || !(sma200w > 0)) {
    return { score: 50, note: "200W SMA nie je dostupná", source: "mock" };
  }
  const dev = ((price - sma200w) / sma200w) * 100;
  const score = Math.round(clamp(mapRange(dev, -40, 100, 8, 96), 0, 100));
  const sign = dev >= 0 ? "+" : "";
  return {
    score,
    note: `BTC ${sign}${dev.toFixed(1)}% vs 200W SMA`,
    source: "live",
  };
}

function liquidityScore(change30d: number | null): { score: number; note: string; source: FactorBreakdown["source"] } {
  if (change30d == null || !Number.isFinite(change30d)) {
    return { score: 50, note: "DefiLlama stables n/a", source: "mock" };
  }
  const score = Math.round(clamp(mapRange(change30d, -12, 14, 12, 92), 0, 100));
  const sign = change30d >= 0 ? "+" : "";
  return {
    score,
    note: `Stablecoin mcap 30d ${sign}${change30d.toFixed(1)}%`,
    source: "live",
  };
}

function cbbcScore(
  cbbi: number | null,
  mock: boolean,
  wma: number,
  fng: number,
): { score: number; note: string; source: FactorBreakdown["source"] } {
  if (cbbi != null && Number.isFinite(cbbi) && !mock) {
    return {
      score: Math.round(clamp(cbbi, 0, 100)),
      note: `CBBI ${cbbi.toFixed(0)}/100`,
      source: "live",
    };
  }
  const blended = Math.round(clamp(wma * 0.55 + fng * 0.45, 0, 100));
  return {
    score: blended,
    note: "CBBI API nedostupné · mock z 200WMA + Fear & Greed",
    source: "mock",
  };
}

function volatilityScore(btc: TokenMarketSnapshot | undefined): { score: number; note: string; source: FactorBreakdown["source"] } {
  const atrPct = lastAtrPercent(btc?.dailyCandles ?? [], btc?.price ?? 0);
  if (!Number.isFinite(atrPct)) {
    return { score: 50, note: "30d ATR n/a", source: "mock" };
  }
  const score = Math.round(clamp(mapRange(atrPct, 1.1, 7.5, 22, 94), 0, 100));
  return {
    score,
    note: `BTC ATR ~30d ${atrPct.toFixed(2)}%`,
    source: "live",
  };
}

function fearScore(value: number | null, label: string | null): { score: number; note: string; source: FactorBreakdown["source"] } {
  if (value == null || !Number.isFinite(value)) {
    return { score: 50, note: "Fear & Greed n/a", source: "mock" };
  }
  return {
    score: Math.round(clamp(value, 0, 100)),
    note: label ? `${label} · ${value.toFixed(0)}/100` : `${value.toFixed(0)}/100`,
    source: "live",
  };
}

export function allocateBaskets(confluence: number): BasketMix {
  const score = clamp(confluence, 0, 100);
  const last = BASKET_ANCHORS[BASKET_ANCHORS.length - 1];
  let low = BASKET_ANCHORS[0];
  let high = last;
  for (let index = 0; index < BASKET_ANCHORS.length - 1; index += 1) {
    const current = BASKET_ANCHORS[index];
    const next = BASKET_ANCHORS[index + 1];
    if (score >= current.c && score <= next.c) {
      low = current;
      high = next;
      break;
    }
  }
  const t = smoothstep(low.c, high.c, score);
  let core = lerp(low.corePercent, high.corePercent, t);
  let satellite = lerp(low.satellitePercent, high.satellitePercent, t);
  let highBeta = Math.min(25, lerp(low.highBetaPercent, high.highBetaPercent, t));
  const sum = core + satellite + highBeta;
  if (sum > 0) {
    core = (core / sum) * 100;
    satellite = (satellite / sum) * 100;
    highBeta = (highBeta / sum) * 100;
  }
  if (highBeta > 25) {
    const extra = highBeta - 25;
    highBeta = 25;
    satellite += extra;
  }
  if (core < 50) {
    const missing = 50 - core;
    const rest = satellite + highBeta;
    if (rest > 0) {
      satellite -= missing * (satellite / rest);
      highBeta -= missing * (highBeta / rest);
    } else {
      satellite = 0;
      highBeta = 0;
    }
    core = 50;
  }
  const corePercent = Math.round(core * 10) / 10;
  const satellitePercent = Math.round(satellite * 10) / 10;
  const highBetaPercent = Math.round((100 - corePercent - satellitePercent) * 10) / 10;
  return { corePercent, satellitePercent, highBetaPercent };
}

function trendScore(btc: TokenMarketSnapshot | undefined): { score: number; note: string; source: FactorBreakdown["source"] } {
  const price = btc?.price ?? 0;
  const ema50 = btc?.indicators?.ema50 ?? 0;
  const ema200 = btc?.indicators?.ema200 ?? 0;
  if (!(price > 0) || !(ema50 > 0) || !(ema200 > 0)) {
    return { score: 50, note: "50D / 200D EMA n/a", source: "mock" };
  }
  const d50 = ((price - ema50) / ema50) * 100;
  const d200 = ((price - ema200) / ema200) * 100;
  const s50 = clamp(mapRange(d50, -18, 22, 8, 94), 0, 100);
  const s200 = clamp(mapRange(d200, -24, 40, 8, 94), 0, 100);
  const score = Math.round(s50 * 0.55 + s200 * 0.45);
  const sign50 = d50 >= 0 ? "+" : "";
  const sign200 = d200 >= 0 ? "+" : "";
  return {
    score,
    note: `BTC ${sign50}${d50.toFixed(1)}% vs 50D EMA · ${sign200}${d200.toFixed(1)}% vs 200D EMA`,
    source: "live",
  };
}

function momentumScore(
  btc: TokenMarketSnapshot | undefined,
  vol: number,
): { score: number; note: string; source: FactorBreakdown["source"] } {
  const rsi = btc?.indicators?.rsi;
  const price = btc?.price ?? 0;
  const closes = btc?.dailyCandles ?? [];
  const rsiScore = rsi != null && Number.isFinite(rsi) ? clamp(rsi, 0, 100) : Number.NaN;
  let rocScore = Number.NaN;
  if (price > 0 && closes.length > 20) {
    const base = closes[closes.length - 21]?.close ?? 0;
    if (base > 0) {
      const roc = ((price - base) / base) * 100;
      rocScore = clamp(mapRange(roc, -22, 38, 10, 92), 0, 100);
    }
  }
  const parts: number[] = [];
  if (Number.isFinite(rsiScore)) parts.push(rsiScore);
  if (Number.isFinite(rocScore)) parts.push(rocScore);
  if (Number.isFinite(vol)) parts.push(vol);
  if (parts.length === 0) {
    return { score: 50, note: "RSI / momentum n/a", source: "mock" };
  }
  const score = Math.round(
    Number.isFinite(rsiScore) && Number.isFinite(rocScore)
      ? rsiScore * 0.55 + rocScore * 0.3 + (Number.isFinite(vol) ? vol * 0.15 : 0)
      : parts.reduce((sum, value) => sum + value, 0) / parts.length,
  );
  const rsiNote = Number.isFinite(rsiScore) ? `RSI ${rsiScore.toFixed(0)}` : "RSI n/a";
  return {
    score: clamp(score, 0, 100),
    note: `${rsiNote} · 20d momentum`,
    source: Number.isFinite(rsiScore) ? "live" : "mock",
  };
}

function blendSource(
  ...parts: Array<{ source: FactorBreakdown["source"] }>
): FactorBreakdown["source"] {
  return parts.every((part) => part.source === "live") ? "live" : parts.some((part) => part.source === "live") ? "live" : "mock";
}

function regimeAffinities(scores: Record<RegimeFactorId, number>): Record<RegimeKind, number> {
  const { valuation, trend, sentiment, momentum, risk } = scores;
  return {
    PANIC: (100 - sentiment) * 0.4 + risk * 0.35 + (100 - trend) * 0.25,
    BEAR: (100 - valuation) * 0.3 + (100 - trend) * 0.4 + (100 - momentum) * 0.3,
    SIDEWAYS: Math.max(
      0,
      100 - Math.abs(valuation - 50) * 0.35 - Math.abs(trend - 50) * 0.35 - Math.abs(sentiment - 50) * 0.3,
    ),
    BULL: trend * 0.4 + valuation * 0.3 + momentum * 0.3,
    EUPHORIA: sentiment * 0.35 + valuation * 0.35 + momentum * 0.3,
  };
}

function interpolateWeights(blend: Record<RegimeKind, number>): Record<RegimeFactorId, number> {
  const ids: RegimeFactorId[] = ["valuation", "trend", "sentiment", "momentum", "risk"];
  const raw: Record<RegimeFactorId, number> = {
    valuation: 0,
    trend: 0,
    sentiment: 0,
    momentum: 0,
    risk: 0,
  };
  for (const kind of REGIME_ORDER) {
    const share = blend[kind] ?? 0;
    for (const id of ids) raw[id] += share * REGIME_WEIGHTS[kind][id];
  }
  const sum = ids.reduce((acc, id) => acc + raw[id], 0);
  if (sum <= 0) return { ...FACTOR_WEIGHTS };
  for (const id of ids) raw[id] = raw[id] / sum;
  return raw;
}

export function buildConfluenceRegime(
  btc: TokenMarketSnapshot | undefined,
  metrics: RegimeMetrics | undefined,
  moneyMode: boolean,
): MarketRegime {
  const wma = wmaScore(btc);
  const fng = fearScore(metrics?.fearGreed ?? null, metrics?.fearGreedLabel ?? null);
  const liq = liquidityScore(metrics?.stablecoinChange30d ?? null);
  const vol = volatilityScore(btc);
  const cbbc = cbbcScore(
    metrics?.cbbi ?? null,
    Boolean(metrics?.cbbiMock),
    wma.score,
    fng.score,
  );
  const trend = trendScore(btc);
  const momentum = momentumScore(btc, vol.score);
  const valuationScore = Math.round(clamp(wma.score * 0.6 + cbbc.score * 0.4, 0, 100));
  const riskScore = Math.round(clamp(liq.score * 0.6 + vol.score * 0.4, 0, 100));

  const rawScores: Record<RegimeFactorId, number> = {
    valuation: valuationScore,
    trend: trend.score,
    sentiment: fng.score,
    momentum: momentum.score,
    risk: riskScore,
  };

  const affinities = regimeAffinities(rawScores);
  const mix = softmax(REGIME_ORDER.map((kind) => affinities[kind] / SOFTMAX_TEMPERATURE));
  const blendMap = Object.fromEntries(
    REGIME_ORDER.map((kind, index) => [kind, mix[index] ?? 0]),
  ) as Record<RegimeKind, number>;
  const weights = interpolateWeights(blendMap);
  const blend: RegimeBlendShare[] = REGIME_ORDER.map((kind, index) => ({
    kind,
    label: REGIME_COPY[kind].label,
    percent: Math.round((mix[index] ?? 0) * 1000) / 10,
  })).filter((row) => row.percent >= 1);

  const factorMeta: Array<{
    id: RegimeFactorId;
    label: string;
    score: number;
    note: string;
    source: FactorBreakdown["source"];
  }> = [
    {
      id: "valuation",
      label: "Valuácia",
      score: valuationScore,
      note: `${wma.note} · ${cbbc.note}`,
      source: blendSource(wma, cbbc),
    },
    {
      id: "trend",
      label: "Trend",
      score: trend.score,
      note: trend.note,
      source: trend.source,
    },
    {
      id: "sentiment",
      label: "Sentiment",
      score: fng.score,
      note: fng.note,
      source: fng.source,
    },
    {
      id: "momentum",
      label: "Momentum",
      score: momentum.score,
      note: momentum.note,
      source: momentum.source,
    },
    {
      id: "risk",
      label: "Riziko / likvidita",
      score: riskScore,
      note: `${liq.note} · ${vol.note}`,
      source: blendSource(liq, vol),
    },
  ];

  const factors: FactorBreakdown[] = factorMeta.map((factor) => {
    const weight = weights[factor.id];
    const contribution = Math.round(factor.score * weight * 10) / 10;
    return {
      ...factor,
      weight,
      contribution,
      formula: `${factor.score} × ${(weight * 100).toFixed(1)}% = ${contribution.toFixed(1)} bodov`,
    };
  });

  const weighted = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);
  const tilt = moneyMode ? 3 : 0;
  const finalScore = Math.round(clamp(weighted + tilt, 0, 100));
  const primary = REGIME_ORDER.reduce((best, kind) =>
    (blendMap[kind] ?? 0) > (blendMap[best] ?? 0) ? kind : best,
  );
  const { label, description, english } = REGIME_COPY[primary];
  const basket = allocateBaskets(finalScore);
  const spread = factors.map((factor) => factor.score);
  const mean = spread.reduce((sum, value) => sum + value, 0) / spread.length;
  const stdev = Math.sqrt(
    spread.reduce((sum, value) => sum + (value - mean) ** 2, 0) / spread.length,
  );
  const confidence =
    stdev < 12 ? "Vysoká" : stdev < 22 ? "Stredná" : "Nízka";
  const confidenceMultiplier =
    Math.round(lerp(1, 0.72, smoothstep(8, 30, stdev)) * 100) / 100;

  return {
    kind: primary,
    englishKind: english,
    label,
    description,
    finalScore,
    allocationPercent: 100,
    confidence,
    confidenceMultiplier,
    factors,
    blend,
    basket,
    safeHaven: finalScore > SAFE_HAVEN_THRESHOLD,
  };
}

export interface WaterfallMember {
  symbol: DcaSymbol;
  approved: boolean;
  priced: boolean;
}

export interface BasketWaterfallResult {
  mode: WaterfallMode;
  amounts: Map<DcaSymbol, number>;
  redirectedUsd: number;
  fromSymbols: DcaSymbol[];
  toSymbols: DcaSymbol[];
  note: string;
}

export function applyEqualWaterfall(
  budget: number,
  members: WaterfallMember[],
  basketLabel: string,
): BasketWaterfallResult {
  const amounts = new Map<DcaSymbol, number>();
  for (const member of members) amounts.set(member.symbol, 0);
  const safeBudget = Math.max(0, roundUsd(budget));
  const priced = members.filter((member) => member.priced);
  const approved = priced.filter((member) => member.approved);
  const failed = priced.filter((member) => !member.approved);

  if (safeBudget <= 0 || priced.length === 0) {
    return {
      mode: "none",
      amounts,
      redirectedUsd: 0,
      fromSymbols: [],
      toSymbols: [],
      note: "",
    };
  }

  if (approved.length === 0) {
    return {
      mode: "full",
      amounts,
      redirectedUsd: safeBudget,
      fromSymbols: failed.map((member) => member.symbol),
      toSymbols: [],
      note: `Celý ${basketLabel} kôš ${safeBudget.toFixed(0)}$ → Core (BTC).`,
    };
  }

  const share = roundUsd(safeBudget / approved.length);
  approved.forEach((member, index) => {
    const value = index === approved.length - 1
      ? roundUsd(safeBudget - share * (approved.length - 1))
      : share;
    amounts.set(member.symbol, value);
  });

  if (failed.length === 0) {
    return {
      mode: "none",
      amounts,
      redirectedUsd: 0,
      fromSymbols: [],
      toSymbols: approved.map((member) => member.symbol),
      note: "",
    };
  }

  const originalShare = roundUsd(safeBudget / priced.length);
  const redirectedUsd = roundUsd(originalShare * failed.length);
  const names = approved.map((member) => member.symbol).join(", ");
  return {
    mode: "partial",
    amounts,
    redirectedUsd,
    fromSymbols: failed.map((member) => member.symbol),
    toSymbols: approved.map((member) => member.symbol),
    note: `${failed.map((member) => member.symbol).join(", ")} → ${names} (rovnaký kôš, po rovnomerných dieloch).`,
  };
}

export const EMPTY_REGIME_METRICS: RegimeMetrics = {
  fearGreed: null,
  fearGreedLabel: null,
  stablecoinMcapUsd: null,
  stablecoinChange30d: null,
  cbbi: null,
  cbbiMock: true,
  fetchedAt: null,
};
