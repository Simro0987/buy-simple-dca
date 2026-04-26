// Monday Crypto DCA Controller — deterministic weekly capital allocation engine.
// Single consistent metric: MARKET VALUATION SCORE (0 = cheap/panic → 100 = expensive/euphoria).
// Higher score = higher risk = lower allocation. Lower score = cheaper market = higher allocation.

import { TOKENS, MARKET_SPLIT, LIMIT_SPLIT, type PriceData } from './crypto';

export interface MondayInputs {
  capital: number;          // Total available capital this Monday (USD)
  btcPrice: number;         // BTC current price (USD)
  btc30dHigh: number;       // BTC 30-day high (USD)
  fearGreed: number;        // 0-100
  btcAbove200dMA: boolean;  // BTC trend vs 200D MA
  // Optional 5-factor inputs (auto-filled when live data is available; safe defaults if absent)
  btc7dChangePct?: number;  // BTC 7-day % change (momentum)
  eth24hChangePct?: number; // ETH 24h % change (risk appetite)
  sol24hChangePct?: number; // SOL 24h % change (risk appetite)
  btc24hChangePct?: number; // BTC 24h % change (used as baseline for risk appetite)
}

export type FactorKey = 'valuation' | 'trend' | 'sentiment' | 'momentum' | 'risk_appetite';

export interface FactorBreakdown {
  key: FactorKey;
  label: string;          // SK label
  score: number;          // 0..100 (higher = pricier / riskier)
  weight: number;         // contribution weight in final score
  detail: string;         // short SK explainer with the underlying number
}

export type ValuationBand = 'deep_value' | 'accumulation' | 'neutral' | 'expensive' | 'euphoria';

export type TrendFilterReason = 'below_ma' | 'below_ma_greedy' | null;

export interface MondayPlan {
  valuationScore: number;         // 0-100 (cheap → expensive) — final weighted blend
  band: ValuationBand;
  bandLabel: string;              // SK label
  regimeLabel: string;            // Cheap / Neutral / Expensive (short)
  deploymentPct: number;          // FINAL pct after stability filter (used for $ math)
  investableUsd: number;
  reservedUsd: number;
  marketUsd: number;
  limitUsd: number;
  rationale: string;
  perAsset: AssetPlan[];
  // 5-factor breakdown
  factors: FactorBreakdown[];
  // Stability filter outputs
  rawDeploymentPct: number;
  stabilityClamped: boolean;
  panicMode: boolean;
  prevDeploymentPct?: number;
  // Trend filter (BTC below 200D MA risk control)
  trendFilterActive: boolean;
  trendFilterReason: TrendFilterReason;
  trendFilterCapPct: number | null;
  trendFilterBypassed: boolean;
  preTrendFilterPct: number;
  // Back-compat
  stressScore: number;
}

export interface AssetPlan {
  symbol: string;
  name: string;
  color: string;
  coingeckoId: string;
  weight: number;
  marketUsd: number;
  limitUsd: number;
  currentPrice: number;
  limitPrice: number;
  limitDiscountPct: number;
  marketQty: number;
  limitQty: number;
}

// ===== STEP 1: 5-Factor Market Model → final Valuation Score (0–100) =====
// All five factors are normalized to a 0..100 "expensive/risky" axis, then
// blended with fixed weights. Higher result = pricier/riskier market = lower allocation.
//
//  1. Valuation       (BTC vs 30D high)        weight 0.30
//  2. Trend           (BTC vs 200D MA)         weight 0.25
//  3. Sentiment       (Fear & Greed)           weight 0.25
//  4. Momentum        (BTC 7D % change)        weight 0.10
//  5. Risk Appetite   (ETH/BTC + SOL strength) weight 0.10  (light weight)

const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  valuation:     0.30,
  trend:         0.25,
  sentiment:     0.25,
  momentum:      0.10,
  risk_appetite: 0.10,
};

function clamp(n: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, n)); }

// 1. Valuation: BTC vs 30D high — exact mapping kept from the previous model.
function valuationFactor(inputs: MondayInputs): FactorBreakdown {
  const ratio = inputs.btc30dHigh > 0 ? inputs.btcPrice / inputs.btc30dHigh : 1;
  let score: number;
  if (ratio <= 0.85) score = Math.max(0, 10 - (0.85 - ratio) * 100);
  else if (ratio <= 1.0) score = 10 + ((ratio - 0.85) / 0.15) * 40;
  else score = 50 + Math.min(50, (ratio - 1.0) * 400);
  score = clamp(score);
  const distancePct = (ratio - 1) * 100;
  const detail = `${distancePct >= 0 ? '+' : ''}${distancePct.toFixed(1)} % vs 30D high`;
  return { key: 'valuation', label: 'Valuation', score: Math.round(score), weight: FACTOR_WEIGHTS.valuation, detail };
}

// 2. Trend: BTC vs 200D MA — boolean → bipolar score around 50.
//    Above MA → 70 (structural bull), Below MA → 30 (defensive).
function trendFactor(inputs: MondayInputs): FactorBreakdown {
  const score = inputs.btcAbove200dMA ? 70 : 30;
  const detail = inputs.btcAbove200dMA ? 'BTC nad 200D MA' : 'BTC pod 200D MA';
  return { key: 'trend', label: 'Trend', score, weight: FACTOR_WEIGHTS.trend, detail };
}

// 3. Sentiment: Fear & Greed (already 0..100, monotonic).
function sentimentFactor(inputs: MondayInputs): FactorBreakdown {
  const score = clamp(inputs.fearGreed);
  const label = score < 25 ? 'Extrémny strach' : score < 45 ? 'Strach' : score <= 55 ? 'Neutrál' : score <= 75 ? 'Chamtivosť' : 'Extrémna chamtivosť';
  return { key: 'sentiment', label: 'Sentiment', score: Math.round(score), weight: FACTOR_WEIGHTS.sentiment, detail: `F&G ${Math.round(score)} · ${label}` };
}

// 4. Momentum: BTC 7D % change. +0% → 50, +10% → 80, +20% → 100, −10% → 20, −20% → 0.
function momentumFactor(inputs: MondayInputs): FactorBreakdown {
  const ch = inputs.btc7dChangePct ?? 0;
  const score = clamp(50 + ch * 3);
  const detail = `BTC 7D ${ch >= 0 ? '+' : ''}${ch.toFixed(1)} %`;
  return { key: 'momentum', label: 'Momentum', score: Math.round(score), weight: FACTOR_WEIGHTS.momentum, detail };
}

// 5. Risk Appetite: ETH + SOL strength relative to BTC (24h).
//    Avg(alt 24h) − BTC 24h → diff. +0 → 50, +5pp → 75, +10pp → 100, −5pp → 25.
function riskAppetiteFactor(inputs: MondayInputs): FactorBreakdown {
  const eth = inputs.eth24hChangePct ?? 0;
  const sol = inputs.sol24hChangePct ?? 0;
  const btc = inputs.btc24hChangePct ?? 0;
  const altAvg = (eth + sol) / 2;
  const diff = altAvg - btc;
  const score = clamp(50 + diff * 5);
  const detail = `Alt − BTC ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} pp`;
  return { key: 'risk_appetite', label: 'Risk Appetite', score: Math.round(score), weight: FACTOR_WEIGHTS.risk_appetite, detail };
}

export function computeFactors(inputs: MondayInputs): FactorBreakdown[] {
  return [
    valuationFactor(inputs),
    trendFactor(inputs),
    sentimentFactor(inputs),
    momentumFactor(inputs),
    riskAppetiteFactor(inputs),
  ];
}

export function computeValuationScore(inputs: MondayInputs): number {
  const factors = computeFactors(inputs);
  const weighted = factors.reduce((s, f) => s + f.score * f.weight, 0);
  return Math.round(clamp(weighted));
}

// ===== STEP 2: Decision engine — fixed mapping (higher score → lower allocation) =====
//    0–25  → 75 % (deep value / panic accumulation)
//   26–45  → 60 % (good accumulation zone)
//   46–65  → 50 % (neutral market)
//   66–80  → 40 % (expensive market)
//   81–100 → 25 % (euphoria / overheated)
export function bandFor(score: number): { band: ValuationBand; pct: number } {
  if (score <= 25) return { band: 'deep_value',    pct: 0.75 };
  if (score <= 45) return { band: 'accumulation',  pct: 0.60 };
  if (score <= 65) return { band: 'neutral',       pct: 0.50 };
  if (score <= 80) return { band: 'expensive',     pct: 0.40 };
  return              { band: 'euphoria',      pct: 0.25 };
}

// Panic Mode: extreme conditions allow bypassing the ±15 % stability filter.
// Triggered by deep capitulation (score <= 15 + extreme fear) OR full euphoria (score >= 90).
export function isPanicMode(score: number, fearGreed: number): boolean {
  if (score <= 15 && fearGreed <= 20) return true; // panic accumulation
  if (score >= 90) return true;                    // euphoria de-risk
  return false;
}

// ===== Trend Filter (risk control when BTC is below 200D MA) =====
// Rules:
//   1. BTC below 200D MA                              → max allocation 60 %
//   2. BTC below 200D MA AND Fear & Greed > 55        → max allocation 40 %
//   3. BTC above 200D MA                              → no cap
//   4. Capitulation panic exception:
//      BTC drawdown > 15 % from 30D high AND F&G < 25 → cap bypassed (allow up to 75 %)
export interface TrendFilterResult {
  active: boolean;
  capPct: number | null;
  reason: TrendFilterReason;
  bypassed: boolean;            // true when panic exception bypasses the cap
  outputPct: number;            // pct after applying (or bypassing) the cap
}

export function applyTrendFilter(
  rawPct: number,
  inputs: MondayInputs,
): TrendFilterResult {
  // Above MA → no cap
  if (inputs.btcAbove200dMA) {
    return { active: false, capPct: null, reason: null, bypassed: false, outputPct: rawPct };
  }

  // Below MA — determine cap
  const cap = inputs.fearGreed > 55 ? 0.40 : 0.60;
  const reason: TrendFilterReason = inputs.fearGreed > 55 ? 'below_ma_greedy' : 'below_ma';

  // Panic exception: rapid >15 % drawdown from 30D high AND extreme fear
  const drawdownPct = inputs.btc30dHigh > 0
    ? (inputs.btc30dHigh - inputs.btcPrice) / inputs.btc30dHigh
    : 0;
  const panicBypass = drawdownPct > 0.15 && inputs.fearGreed < 25;
  if (panicBypass) {
    // Allow original raw pct (capped at 75 %) regardless of MA filter
    return {
      active: false,
      capPct: cap,
      reason,
      bypassed: true,
      outputPct: Math.min(rawPct, 0.75),
    };
  }

  if (rawPct <= cap) {
    return { active: false, capPct: cap, reason, bypassed: false, outputPct: rawPct };
  }
  return { active: true, capPct: cap, reason, bypassed: false, outputPct: cap };
}

// Allocation Stability Filter: limit week-over-week change to ±15 % (absolute pct points)
// unless Panic Mode is active.
export function applyStabilityFilter(
  rawPct: number,
  prevPct: number | undefined,
  panic: boolean,
): { finalPct: number; clamped: boolean; deltaPct: number } {
  if (panic || prevPct === undefined) {
    return { finalPct: rawPct, clamped: false, deltaPct: prevPct === undefined ? 0 : rawPct - prevPct };
  }
  const maxDelta = 0.15;
  const delta = rawPct - prevPct;
  if (Math.abs(delta) <= maxDelta) {
    return { finalPct: rawPct, clamped: false, deltaPct: delta };
  }
  const clampedPct = prevPct + Math.sign(delta) * maxDelta;
  return { finalPct: clampedPct, clamped: true, deltaPct: delta };
}

export function bandLabel(band: ValuationBand): string {
  switch (band) {
    case 'deep_value':   return 'Hlboká hodnota';
    case 'accumulation': return 'Akumulácia';
    case 'neutral':      return 'Neutrál';
    case 'expensive':    return 'Drahý trh';
    case 'euphoria':     return 'Eufória';
  }
}

// Short regime tag: Cheap / Neutral / Expensive
export function regimeShortLabel(band: ValuationBand): string {
  switch (band) {
    case 'deep_value':
    case 'accumulation': return 'LACNÝ';
    case 'neutral':      return 'NEUTRÁLNY';
    case 'expensive':
    case 'euphoria':     return 'DRAHÝ';
  }
}

export function rationaleFor(band: ValuationBand, score: number): string {
  const pct = Math.round(bandFor(score).pct * 100);
  switch (band) {
    case 'deep_value':
      return `Valuation ${score}/100 — hlboká hodnota / panika. Nasadenie ${pct} % (akumulácia v lacnom trhu).`;
    case 'accumulation':
      return `Valuation ${score}/100 — dobrá akumulačná zóna. Nasadenie ${pct} %.`;
    case 'neutral':
      return `Valuation ${score}/100 — neutrálny trh. Štandardné nasadenie ${pct} %.`;
    case 'expensive':
      return `Valuation ${score}/100 — drahý trh. Redukované nasadenie ${pct} %.`;
    case 'euphoria':
      return `Valuation ${score}/100 — eufória / prehriatie. Defenzívne nasadenie ${pct} %.`;
  }
}

function discountPctFor(coingeckoId: string): number {
  const t = TOKENS.find(x => x.coingeckoId === coingeckoId);
  if (!t) return 4;
  return Math.round((1 - t.limitDiscount) * 100);
}

// ===== STEP 3 + 4: Execution split & per-asset distribution =====
export function buildPlan(
  inputs: MondayInputs,
  prices?: PriceData,
  prevDeploymentPct?: number,
): MondayPlan {
  const factors = computeFactors(inputs);
  const score = computeValuationScore(inputs);
  const { band, pct: rawPct } = bandFor(score);

  // Trend filter — risk control when BTC is below 200D MA. Runs BEFORE stability filter
  // so that the ±15 % WoW limit clamps relative to the trend-adjusted value.
  const trend = applyTrendFilter(rawPct, inputs);
  const postTrendPct = trend.outputPct;

  const panicMode = isPanicMode(score, inputs.fearGreed);
  const stab = applyStabilityFilter(postTrendPct, prevDeploymentPct, panicMode);
  const finalPct = stab.finalPct;

  const investableUsd = inputs.capital * finalPct;
  const reservedUsd = inputs.capital - investableUsd;
  const marketUsd = investableUsd * MARKET_SPLIT;
  const limitUsd = investableUsd * LIMIT_SPLIT;

  const perAsset: AssetPlan[] = TOKENS.map(t => {
    const assetMarket = marketUsd * t.allocation;
    const assetLimit = limitUsd * t.allocation;
    const livePrice = prices?.[t.coingeckoId]?.usd;
    const currentPrice = livePrice && livePrice > 0
      ? livePrice
      : (t.coingeckoId === 'bitcoin' ? inputs.btcPrice : 0);
    const limitPrice = currentPrice * t.limitDiscount;
    return {
      symbol: t.symbol,
      name: t.name,
      color: t.color,
      coingeckoId: t.coingeckoId,
      weight: t.allocation,
      marketUsd: assetMarket,
      limitUsd: assetLimit,
      currentPrice,
      limitPrice,
      limitDiscountPct: discountPctFor(t.coingeckoId),
      marketQty: currentPrice > 0 ? assetMarket / currentPrice : 0,
      limitQty: limitPrice > 0 ? assetLimit / limitPrice : 0,
    };
  });

  // Compose rationale with trend-filter explanation appended when active
  let rationale = rationaleFor(band, score);
  if (trend.active) {
    const capPctTxt = Math.round((trend.capPct ?? 0) * 100);
    const rawPctTxt = Math.round(rawPct * 100);
    rationale += trend.reason === 'below_ma_greedy'
      ? ` ⚠️ Trend Filter: BTC pod 200D MA + Fear & Greed > 55 → alokácia obmedzená z ${rawPctTxt} % na ${capPctTxt} % (kontrola rizika).`
      : ` ⚠️ Trend Filter: lacné valuation, ale BTC zostáva pod 200D MA → alokácia znížená z ${rawPctTxt} % na ${capPctTxt} % (kontrola rizika).`;
  } else if (trend.bypassed) {
    rationale += ` ⚡ Panic exception: BTC > 15 % pod 30D high + extrémny strach → trend filter bypassed.`;
  }

  return {
    valuationScore: score,
    band,
    bandLabel: bandLabel(band),
    regimeLabel: regimeShortLabel(band),
    deploymentPct: finalPct,
    rawDeploymentPct: rawPct,
    stabilityClamped: stab.clamped,
    panicMode,
    prevDeploymentPct,
    trendFilterActive: trend.active,
    trendFilterReason: trend.reason,
    trendFilterCapPct: trend.capPct,
    trendFilterBypassed: trend.bypassed,
    preTrendFilterPct: rawPct,
    investableUsd,
    reservedUsd,
    marketUsd,
    limitUsd,
    rationale,
    perAsset,
    stressScore: score,
  };
}

// ===== History persistence =====
const HISTORY_KEY = 'monday-controller-history-v1';

export interface HistoryEntry {
  date: string;
  inputs: MondayInputs;
  plan: {
    valuationScore: number;
    band: ValuationBand;
    deploymentPct: number;
    investableUsd: number;
    reservedUsd: number;
    // legacy alias kept readable
    stressScore?: number;
  };
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryEntry[];
    // Migrate legacy entries (stressScore → valuationScore is NOT semantically equal, but keep displayable)
    return arr.map(h => ({
      ...h,
      plan: {
        ...h.plan,
        valuationScore: h.plan.valuationScore ?? h.plan.stressScore ?? 50,
      },
    }));
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const all = loadHistory();
  const filtered = all.filter(h => h.date !== entry.date);
  const next = [entry, ...filtered].slice(0, 52);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function thisMondayIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function exportHistoryCsv(history: HistoryEntry[]): string {
  const headers = ['date', 'capital', 'btcPrice', 'btc30dHigh', 'fearGreed', 'above200dMA', 'valuationScore', 'band', 'deploymentPct', 'investableUsd', 'reservedUsd'];
  const rows = history.map(h => [
    h.date,
    h.inputs.capital,
    h.inputs.btcPrice,
    h.inputs.btc30dHigh,
    h.inputs.fearGreed,
    h.inputs.btcAbove200dMA ? 'Y' : 'N',
    h.plan.valuationScore,
    h.plan.band,
    h.plan.deploymentPct,
    h.plan.investableUsd.toFixed(2),
    h.plan.reservedUsd.toFixed(2),
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
