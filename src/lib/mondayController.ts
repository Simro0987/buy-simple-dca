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
}

export type ValuationBand = 'deep_value' | 'accumulation' | 'neutral' | 'expensive' | 'euphoria';

export type TrendFilterReason = 'below_ma' | 'below_ma_greedy' | null;

export interface MondayPlan {
  valuationScore: number;         // 0-100 (cheap → expensive) — single source of truth
  band: ValuationBand;
  bandLabel: string;              // SK label
  regimeLabel: string;            // Cheap / Neutral / Expensive (short)
  deploymentPct: number;          // FINAL pct after stability filter (used for $ math)
  investableUsd: number;
  reservedUsd: number;
  marketUsd: number;
  limitUsd: number;
  rationale: string;              // single explanation derived from valuation only
  perAsset: AssetPlan[];
  // Stability filter outputs
  rawDeploymentPct: number;       // raw band pct from valuation score (pre-clamp)
  stabilityClamped: boolean;      // true if ±15 % filter altered the value
  panicMode: boolean;             // true if filter was bypassed due to extreme conditions
  prevDeploymentPct?: number;     // last week's final pct, if available
  // Trend filter (BTC below 200D MA risk control)
  trendFilterActive: boolean;     // true if a below-MA cap reduced allocation
  trendFilterReason: TrendFilterReason;
  trendFilterCapPct: number | null; // the cap that was applied (e.g. 0.60, 0.40)
  trendFilterBypassed: boolean;   // true when capitulation panic bypassed the cap
  preTrendFilterPct: number;      // band pct before trend filter (= rawDeploymentPct)
  // Back-compat
  stressScore: number;            // alias = valuationScore
}

export interface AssetPlan {
  symbol: string;
  name: string;
  color: string;
  coingeckoId: string;
  weight: number;                 // 0.64 / 0.25 / 0.11
  marketUsd: number;
  limitUsd: number;
  currentPrice: number;
  limitPrice: number;             // 3-5% below current
  limitDiscountPct: number;
  marketQty: number;
  limitQty: number;
}

// ===== STEP 1: Market Valuation Score (0–100) =====
// Single concept: how expensive vs cheap the market is.
//   0   = extremely cheap (panic / capitulation)
//   50  = neutral
//   100 = extremely expensive (euphoria / ATH / overheated)
export function computeValuationScore(inputs: MondayInputs): number {
  // 1. BTC vs 30D high → price-action valuation component (0..100)
  //    -15% (or worse) below high → 0–20
  //    around the high            → ~50
  //    above the high             → 80–100
  const ratio = inputs.btc30dHigh > 0 ? inputs.btcPrice / inputs.btc30dHigh : 1;
  // Map ratio to score:
  //   ratio = 0.85 → 10   (15% under high → deep value)
  //   ratio = 1.00 → 50   (at the high)
  //   ratio = 1.10 → 90   (10% above 30D high → expensive)
  let priceScore: number;
  if (ratio <= 0.85) priceScore = Math.max(0, 10 - (0.85 - ratio) * 100); // sub-15% → ≤10
  else if (ratio <= 1.0) priceScore = 10 + ((ratio - 0.85) / 0.15) * 40;  // 0.85→10, 1.00→50
  else priceScore = 50 + Math.min(50, (ratio - 1.0) * 400);               // +10% → 90, +12.5% → 100
  priceScore = Math.max(0, Math.min(100, priceScore));

  // 2. Fear & Greed → sentiment valuation component (already 0..100, monotonic)
  const fgScore = Math.max(0, Math.min(100, inputs.fearGreed));

  // 3. 200D MA bias: above MA = pricier regime (+15), below MA = cheaper regime (−15)
  const maAdj = inputs.btcAbove200dMA ? 15 : -15;

  // Average of normalized components, then apply MA bias
  const avg = (priceScore + fgScore) / 2;
  const score = Math.round(Math.max(0, Math.min(100, avg + maAdj)));
  return score;
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
