import { ATR } from "technicalindicators";
import { computeSma } from "@/lib/dca/indicators";
import { clamp, lerp, roundUsd, smoothstep } from "@/lib/dca/math";
import type {
  BasketMix,
  DcaSymbol,
  FactorBreakdown,
  MarketRegime,
  RegimeKind,
  RegimeMetrics,
  TokenMarketSnapshot,
  WaterfallMode,
} from "@/lib/dca/types";

export const FACTOR_WEIGHTS = {
  wma200: 0.35,
  liquidity: 0.25,
  cbbc: 0.2,
  volatility: 0.1,
  fearGreed: 0.1,
} as const;

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
  const corePercent = Math.round(core * 10) / 10;
  const satellitePercent = Math.round(satellite * 10) / 10;
  const highBetaPercent = Math.round((100 - corePercent - satellitePercent) * 10) / 10;
  return { corePercent, satellitePercent, highBetaPercent };
}

function kindFromScore(score: number): { kind: RegimeKind; label: string; description: string } {
  if (score > 85) {
    return { kind: "EXTREME_EUPHORIA", label: "EUFÓRIA", description: "Extrémna eufória" };
  }
  if (score >= 65) {
    return { kind: "EUPHORIA", label: "EUFÓRIA", description: "Rizikový apetít rastie" };
  }
  if (score < 30) {
    return { kind: "FEAR", label: "STRACH", description: "Extrémny strach" };
  }
  return { kind: "NEUTRAL", label: "NEUTRÁL", description: "Vyvážený režim" };
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

  const factors: FactorBreakdown[] = [
    { id: "wma200", label: "200WMA", score: wma.score, weight: FACTOR_WEIGHTS.wma200, note: wma.note, source: wma.source },
    { id: "liquidity", label: "Likvidita", score: liq.score, weight: FACTOR_WEIGHTS.liquidity, note: liq.note, source: liq.source },
    { id: "cbbc", label: "CBBC", score: cbbc.score, weight: FACTOR_WEIGHTS.cbbc, note: cbbc.note, source: cbbc.source },
    { id: "volatility", label: "Volatilita", score: vol.score, weight: FACTOR_WEIGHTS.volatility, note: vol.note, source: vol.source },
    { id: "fearGreed", label: "Fear & Greed", score: fng.score, weight: FACTOR_WEIGHTS.fearGreed, note: fng.note, source: fng.source },
  ];

  const weighted = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);
  const tilt = moneyMode ? 3 : 0;
  const finalScore = Math.round(clamp(weighted + tilt, 0, 100));
  const { kind, label, description } = kindFromScore(finalScore);
  const basket = allocateBaskets(finalScore);
  const spread = factors.map((factor) => factor.score);
  const mean = spread.reduce((sum, value) => sum + value, 0) / spread.length;
  const stdev = Math.sqrt(
    spread.reduce((sum, value) => sum + (value - mean) ** 2, 0) / spread.length,
  );
  const confidence =
    stdev < 12 ? "Vysoká" : stdev < 22 ? "Stredná" : "Nízka";

  return {
    kind,
    label,
    description,
    finalScore,
    allocationPercent: 100,
    confidence,
    confidenceMultiplier: 1,
    factors,
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
