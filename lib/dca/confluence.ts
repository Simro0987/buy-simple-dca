import { ATR } from "technicalindicators";
import { computeWma } from "@/lib/dca/indicators";
import { clamp, lerp, mapRange, roundUsd, smoothstep } from "@/lib/dca/math";
import type {
  BasketMix,
  ConfluenceIndicator,
  ConfluenceIndicatorId,
  DcaSymbol,
  MarketRegime,
  RegimeKind,
  RegimeMetrics,
  TokenMarketSnapshot,
  WaterfallMode,
} from "@/lib/dca/types";

export const REGIME_COPY: Record<
  RegimeKind,
  { english: string; label: string; description: string }
> = {
  PANIC: { english: "PANIC", label: "PANIKA", description: "Extrémny strach a volatilita" },
  BEAR: { english: "BEAR", label: "MEDVEĎ", description: "Medvedí trend" },
  SIDEWAYS: { english: "SIDEWAYS", label: "STRANA", description: "Bočný pohyb" },
  BULL: { english: "BULL", label: "BÝK", description: "Býčí trend" },
  EUPHORIA: { english: "EUPHORIA", label: "EUFÓRIA", description: "Rizikový apetít na maxime" },
};

export const REGIME_ORDER: RegimeKind[] = ["PANIC", "BEAR", "SIDEWAYS", "BULL", "EUPHORIA"];

export const SAFE_HAVEN_THRESHOLD = 85;

export const SAFE_HAVEN_COPY =
  "⚠️ TRH JE V EXTRÉMNEJ EUFÓRII. Zvážte manuálne presmerovanie 20 % – 30 % týždenného vkladu do stabilných výnosov (napr. sUSDe, sUSDS) alebo tokenizovaného zlata (PAXG) na vybudovanie rezerv (Dry Powder).";

/** Equal weights for the five Phase B CONFLUENCE indicators. */
export const CONFLUENCE_WEIGHTS: Record<ConfluenceIndicatorId, number> = {
  wma: 0.2,
  fearGreed: 0.2,
  liquidity: 0.2,
  volatility: 0.2,
  cbbi: 0.2,
};

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

function wmaDistance(btc: TokenMarketSnapshot | undefined): Omit<ConfluenceIndicator, "weight" | "contribution" | "formula"> {
  const price = btc?.price ?? 0;
  const weekly = btc?.weeklyCandles ?? [];
  const wma200 = computeWma(weekly.map((candle) => candle.close), 200);
  if (!(price > 0) || !(wma200 > 0)) {
    return {
      id: "wma",
      label: "200 WMA",
      score: 50,
      note: "200W WMA nie je dostupná",
      source: "mock",
    };
  }
  const dev = ((price - wma200) / wma200) * 100;
  const score = Math.round(clamp(mapRange(dev, -40, 100, 8, 96), 0, 100));
  const sign = dev >= 0 ? "+" : "";
  return {
    id: "wma",
    label: "200 WMA",
    score,
    note: `BTC ${sign}${dev.toFixed(1)}% vs 200W WMA`,
    source: "live",
  };
}

function fearGreed(metrics: RegimeMetrics | undefined): Omit<ConfluenceIndicator, "weight" | "contribution" | "formula"> {
  const value = metrics?.fearGreed;
  if (value == null || !Number.isFinite(value)) {
    return {
      id: "fearGreed",
      label: "Fear & Greed",
      score: 50,
      note: "Fear & Greed n/a",
      source: "mock",
    };
  }
  return {
    id: "fearGreed",
    label: "Fear & Greed",
    score: Math.round(clamp(value, 0, 100)),
    note: metrics?.fearGreedLabel
      ? `${metrics.fearGreedLabel} · ${value.toFixed(0)}/100`
      : `${value.toFixed(0)}/100`,
    source: "live",
  };
}

function liquidity(metrics: RegimeMetrics | undefined): Omit<ConfluenceIndicator, "weight" | "contribution" | "formula"> {
  const change30d = metrics?.stablecoinChange30d ?? null;
  if (change30d == null || !Number.isFinite(change30d)) {
    return {
      id: "liquidity",
      label: "Likvidita",
      score: 50,
      note: "DefiLlama stables n/a",
      source: "mock",
    };
  }
  const score = Math.round(clamp(mapRange(change30d, -12, 14, 12, 92), 0, 100));
  const sign = change30d >= 0 ? "+" : "";
  return {
    id: "liquidity",
    label: "Likvidita",
    score,
    note: `Stablecoin mcap 30d ${sign}${change30d.toFixed(1)}%`,
    source: "live",
  };
}

function volatility(btc: TokenMarketSnapshot | undefined): Omit<ConfluenceIndicator, "weight" | "contribution" | "formula"> {
  const atrPct = lastAtrPercent(btc?.dailyCandles ?? [], btc?.price ?? 0);
  if (!Number.isFinite(atrPct)) {
    return {
      id: "volatility",
      label: "Volatilita ATR",
      score: 50,
      note: "30d ATR n/a",
      source: "mock",
    };
  }
  const score = Math.round(clamp(mapRange(atrPct, 1.1, 7.5, 82, 14), 0, 100));
  return {
    id: "volatility",
    label: "Volatilita ATR",
    score,
    note: `BTC ATR ~30d ${atrPct.toFixed(2)}% (vyššia vol → viac Core)`,
    source: "live",
  };
}

function cbbiScore(
  metrics: RegimeMetrics | undefined,
  wma: number,
  fng: number,
): Omit<ConfluenceIndicator, "weight" | "contribution" | "formula"> {
  const cbbi = metrics?.cbbi;
  if (cbbi != null && Number.isFinite(cbbi) && !metrics?.cbbiMock) {
    return {
      id: "cbbi",
      label: "CBBI",
      score: Math.round(clamp(cbbi, 0, 100)),
      note: `CBBI ${cbbi.toFixed(0)}/100`,
      source: "live",
    };
  }
  const blended = Math.round(clamp(wma * 0.55 + fng * 0.45, 0, 100));
  return {
    id: "cbbi",
    label: "CBBI",
    score: blended,
    note: "CBBI API nedostupné · fallback 200WMA + Fear & Greed",
    source: "mock",
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

export interface ConfluenceBrain {
  score: number;
  indicators: ConfluenceIndicator[];
  basket: BasketMix;
  safeHaven: boolean;
}

export function buildConfluenceBrain(
  btc: TokenMarketSnapshot | undefined,
  metrics: RegimeMetrics | undefined,
): ConfluenceBrain {
  const wma = wmaDistance(btc);
  const fng = fearGreed(metrics);
  const liq = liquidity(metrics);
  const vol = volatility(btc);
  const cbbi = cbbiScore(metrics, wma.score, fng.score);
  const raw = [wma, fng, liq, vol, cbbi];
  const indicators: ConfluenceIndicator[] = raw.map((row) => {
    const weight = CONFLUENCE_WEIGHTS[row.id];
    const contribution = Math.round(row.score * weight * 10) / 10;
    return {
      ...row,
      weight,
      contribution,
      formula: `${row.score} × ${(weight * 100).toFixed(0)}% = ${contribution.toFixed(1)} bodov`,
    };
  });
  const score = Math.round(
    clamp(
      indicators.reduce((sum, row) => sum + row.score * row.weight, 0),
      0,
      100,
    ),
  );
  return {
    score,
    indicators,
    basket: allocateBaskets(score),
    safeHaven: score > SAFE_HAVEN_THRESHOLD,
  };
}

/** @deprecated Use buildConfluenceBrain + calculateDeploymentScore. */
export function buildConfluenceRegime(
  btc: TokenMarketSnapshot | undefined,
  metrics: RegimeMetrics | undefined,
  _moneyMode: boolean,
): Pick<MarketRegime, "confluenceScore" | "confluenceIndicators" | "basket" | "safeHaven"> {
  void _moneyMode;
  const brain = buildConfluenceBrain(btc, metrics);
  return {
    confluenceScore: brain.score,
    confluenceIndicators: brain.indicators,
    basket: brain.basket,
    safeHaven: brain.safeHaven,
  };
}

export interface WaterfallMember {
  symbol: DcaSymbol;
  approved: boolean;
  priced: boolean;
  rsi: number;
}

export interface BasketWaterfallResult {
  mode: WaterfallMode;
  amounts: Map<DcaSymbol, number>;
  weights: Map<DcaSymbol, number>;
  absorbed: Map<DcaSymbol, number>;
  redirectedUsd: number;
  leftoverUsd: number;
  fromSymbols: DcaSymbol[];
  toSymbols: DcaSymbol[];
  note: string;
}

function emptyWaterfall(members: WaterfallMember[]): BasketWaterfallResult {
  const amounts = new Map<DcaSymbol, number>();
  const weights = new Map<DcaSymbol, number>();
  const absorbed = new Map<DcaSymbol, number>();
  for (const member of members) {
    amounts.set(member.symbol, 0);
    weights.set(member.symbol, 0);
    absorbed.set(member.symbol, 0);
  }
  return {
    mode: "none",
    amounts,
    weights,
    absorbed,
    redirectedUsd: 0,
    leftoverUsd: 0,
    fromSymbols: [],
    toSymbols: [],
    note: "",
  };
}

/** Inverse-RSI share of a PASS basket. Weight = 100 − RSI. */
export function inverseRsiWeight(rsi: number): number {
  return Math.max(1, 100 - (Number.isFinite(rsi) ? rsi : 50));
}

export function applyInverseRsiWaterfall(
  budget: number,
  members: WaterfallMember[],
  basketLabel: string,
): BasketWaterfallResult {
  const result = emptyWaterfall(members);
  const safeBudget = Math.max(0, roundUsd(budget));
  const priced = members.filter((member) => member.priced);
  const approved = priced.filter((member) => member.approved);
  const failed = priced.filter((member) => !member.approved);

  if (safeBudget <= 0 || priced.length === 0) return result;

  if (approved.length === 0) {
    return {
      ...result,
      mode: "full",
      redirectedUsd: safeBudget,
      leftoverUsd: safeBudget,
      fromSymbols: failed.map((member) => member.symbol),
      note: `Celý ${basketLabel} kôš ${safeBudget.toFixed(0)}$ → Dostupný Kapitál.`,
    };
  }

  const weightSum = approved.reduce((sum, member) => sum + inverseRsiWeight(member.rsi), 0);
  let allocated = 0;
  approved.forEach((member, index) => {
    const weight = inverseRsiWeight(member.rsi);
    const percent = (weight / weightSum) * 100;
    result.weights.set(member.symbol, percent);
    const value =
      index === approved.length - 1
        ? roundUsd(safeBudget - allocated)
        : roundUsd(safeBudget * (weight / weightSum));
    allocated = roundUsd(allocated + value);
    result.amounts.set(member.symbol, value);
  });

  if (failed.length === 0) {
    return {
      ...result,
      mode: "none",
      toSymbols: approved.map((member) => member.symbol),
    };
  }

  const originalUnit = priced.length > 0 ? safeBudget / priced.length : 0;
  for (const member of approved) {
    const amount = result.amounts.get(member.symbol) ?? 0;
    result.absorbed.set(member.symbol, roundUsd(Math.max(0, amount - originalUnit)));
  }

  const names = approved.map((member) => member.symbol).join(", ");
  return {
    ...result,
    mode: "partial",
    redirectedUsd: roundUsd((safeBudget / priced.length) * failed.length),
    leftoverUsd: 0,
    fromSymbols: failed.map((member) => member.symbol),
    toSymbols: approved.map((member) => member.symbol),
    note: `${failed.map((member) => member.symbol).join(", ")} → ${names} (inverse RSI).`,
  };
}

/** @deprecated Prefer applyInverseRsiWaterfall. */
export function applyEqualWaterfall(
  budget: number,
  members: WaterfallMember[],
  basketLabel: string,
): BasketWaterfallResult {
  return applyInverseRsiWaterfall(budget, members, basketLabel);
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
