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

  const panicMode = isPanicMode(score, inputs.fearGreed);
  const stab = applyStabilityFilter(rawPct, prevDeploymentPct, panicMode);
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
    investableUsd,
    reservedUsd,
    marketUsd,
    limitUsd,
    rationale: rationaleFor(band, score),
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
