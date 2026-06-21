// Monday Crypto DCA Controller — institutional-grade adaptive allocator.
// - Detects BTC market regime automatically (Bull / Bear / Sideways / Panic / Euphoria).
// - Applies regime-specific factor weights to a 5-factor model.
// - Computes a smooth allocation (formula-based, no rigid bands).
// - Confidence multiplier rewards factor agreement, dampens contradictions.
//
// Higher final score = pricier / riskier  → lower allocation.
// Lower final score  = cheaper / attractive → higher allocation.

import { TOKENS, MARKET_SPLIT, LIMIT_SPLIT, type PriceData } from './crypto';
import { getEffectiveLimitInfo } from './dynamicLimits';
import { continuousBudgetPct, continuousTokenSplit, tokenWeightFraction, budgetWhyText } from './dcaAllocationEngine';

export type Regime = 'bull' | 'bear' | 'sideways' | 'panic' | 'euphoria';

export interface MondayInputs {
  capital: number;
  btcPrice: number;
  btc30dHigh: number;
  fearGreed: number;
  btcAbove200dMA: boolean;
  // 5-factor + regime detection inputs (auto-filled when live data is available)
  btc7dChangePct?: number;
  btc30dChangePct?: number;       // 30D momentum
  btcDistanceFrom30dHighPct?: number; // negative when below 30D high
  btcMa50AboveMa200?: boolean;    // golden/death cross
  btcVolatility30dPct?: number;   // realized vol (stdev of daily returns), %
  eth24hChangePct?: number;
  sol24hChangePct?: number;
  btc24hChangePct?: number;
}

export type FactorKey = 'valuation' | 'trend' | 'sentiment' | 'momentum' | 'risk_appetite';

export interface FactorBreakdown {
  key: FactorKey;
  label: string;
  score: number;   // 0..100 (higher = pricier / riskier)
  weight: number;  // active regime weight
  detail: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface MondayPlan {
  // Regime detection
  regime: Regime;
  regimeLabel: string;        // SK label
  regimeShort: string;        // BULL / BEAR / SIDEWAYS / PANIC / EUFÓRIA

  // 5-factor model
  factors: FactorBreakdown[];
  factorScore: number;        // 0..100 (active-regime weighted blend)

  // Smooth allocation
  baseAllocationPct: number;  // before confidence multiplier
  confidence: ConfidenceLevel;
  confidenceAgreement: number; // 0..1 (how aligned the factors are)
  confidenceMultiplier: number; // 1.00 / 0.93 / 0.85
  finalAllocationPct: number; // after confidence multiplier (rounded whole %)
  overrideTriggered: 'panic_floor' | 'euphoria_ceiling' | null;

  // Limit-order config (regime-aware discount)
  limitDiscountPct: number;   // e.g. 4 = 4 % below market

  // Capital math
  investableUsd: number;
  reservedUsd: number;
  marketUsd: number;
  limitUsd: number;
  perAsset: AssetPlan[];

  // Narrative
  rationale: string;

  // Back-compat (legacy fields)
  valuationScore: number;     // alias of factorScore
  band: ValuationBand;
  bandLabel: string;
  regimeLabel_legacy: string;
  deploymentPct: number;      // alias of finalAllocationPct/100
  rawDeploymentPct: number;
  stabilityClamped: boolean;
  panicMode: boolean;
  prevDeploymentPct?: number;
  trendFilterActive: boolean;
  trendFilterReason: null;
  trendFilterCapPct: number | null;
  trendFilterBypassed: boolean;
  preTrendFilterPct: number;
  stressScore: number;
}

export type ValuationBand = 'deep_value' | 'accumulation' | 'neutral' | 'expensive' | 'euphoria';

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

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ============================================================
// 1) AUTO REGIME DETECTION
// ============================================================
//
// Signals:
//   - BTC price vs 200D MA
//   - 50D MA vs 200D MA
//   - Distance from 30D high
//   - 30D realized volatility
//   - Fear & Greed Index
//   - 30D momentum (BTC 30D % change)

export function detectRegime(inputs: MondayInputs): Regime {
  const above200 = inputs.btcAbove200dMA;
  const goldenCross = inputs.btcMa50AboveMa200 ?? above200;
  const mom30 = inputs.btc30dChangePct ?? 0;
  const distHigh = inputs.btcDistanceFrom30dHighPct ?? 0; // ≤0 normally
  const vol = inputs.btcVolatility30dPct ?? 2;
  const fg = inputs.fearGreed;

  // PANIC CAPITULATION — sharp drop, high vol, extreme fear
  if (mom30 <= -15 && vol >= 3 && fg <= 25) return 'panic';
  if (distHigh <= -25 && fg <= 20) return 'panic';

  // EUPHORIC BLOW-OFF — near highs, stretched above MA, extreme greed, hot momentum
  if (above200 && distHigh >= -3 && fg >= 75 && mom30 >= 15) return 'euphoria';
  if (above200 && fg >= 80 && mom30 >= 20) return 'euphoria';

  // BULL TREND — above 200D, golden cross, positive momentum
  if (above200 && goldenCross && mom30 > 2) return 'bull';

  // BEAR TREND — below 200D, death cross, negative momentum
  if (!above200 && !goldenCross && mom30 < -2) return 'bear';

  // SIDEWAYS / RANGE — anything else (low directional conviction)
  return 'sideways';
}

const REGIME_LABEL_SK: Record<Regime, string> = {
  bull:      'Býčí trend',
  bear:      'Medvedí trend',
  sideways:  'Bočný pohyb',
  panic:     'Panická kapitulácia',
  euphoria:  'Eufória',
};

const REGIME_SHORT: Record<Regime, string> = {
  bull:      'BULL',
  bear:      'BEAR',
  sideways:  'SIDEWAYS',
  panic:     'PANIC',
  euphoria:  'EUFÓRIA',
};

// ============================================================
// 2) ADAPTIVE FACTOR WEIGHTS BY REGIME
// ============================================================

const REGIME_WEIGHTS: Record<Regime, Record<FactorKey, number>> = {
  bull:     { valuation: 0.20, trend: 0.35, sentiment: 0.15, momentum: 0.20, risk_appetite: 0.10 },
  bear:     { valuation: 0.35, trend: 0.30, sentiment: 0.20, momentum: 0.05, risk_appetite: 0.10 },
  sideways: { valuation: 0.30, trend: 0.20, sentiment: 0.20, momentum: 0.15, risk_appetite: 0.15 },
  panic:    { valuation: 0.45, trend: 0.15, sentiment: 0.25, momentum: 0.05, risk_appetite: 0.10 },
  euphoria: { valuation: 0.35, trend: 0.10, sentiment: 0.25, momentum: 0.10, risk_appetite: 0.20 },
};

// ============================================================
// 3) FACTOR SCORERS — all on a 0..100 "expensive/risky" axis
// ============================================================

function valuationFactor(inputs: MondayInputs, w: number): FactorBreakdown {
  const ratio = inputs.btc30dHigh > 0 ? inputs.btcPrice / inputs.btc30dHigh : 1;
  let score: number;
  if (ratio <= 0.85) score = Math.max(0, 10 - (0.85 - ratio) * 100);
  else if (ratio <= 1.0) score = 10 + ((ratio - 0.85) / 0.15) * 40;
  else score = 50 + Math.min(50, (ratio - 1.0) * 400);
  score = clamp(score);
  const distancePct = (ratio - 1) * 100;
  return {
    key: 'valuation', label: 'Valuation', weight: w,
    score: Math.round(score),
    detail: `${distancePct >= 0 ? '+' : ''}${distancePct.toFixed(1)} % vs 30D high`,
  };
}

function trendFactor(inputs: MondayInputs, w: number): FactorBreakdown {
  // Combine 200D + 50D state. Both above = strong bull (80), both below = bear (20),
  // mixed = neutral (50).
  const above200 = inputs.btcAbove200dMA;
  const golden = inputs.btcMa50AboveMa200 ?? above200;
  let score = 50;
  if (above200 && golden) score = 80;
  else if (!above200 && !golden) score = 20;
  else score = 50;
  const detail = `${above200 ? 'nad' : 'pod'} 200D · ${golden ? 'golden' : 'death'} cross`;
  return { key: 'trend', label: 'Trend', score, weight: w, detail };
}

function sentimentFactor(inputs: MondayInputs, w: number): FactorBreakdown {
  const score = clamp(inputs.fearGreed);
  const label = score < 25 ? 'Extrémny strach'
    : score < 45 ? 'Strach'
    : score <= 55 ? 'Neutrál'
    : score <= 75 ? 'Chamtivosť'
    : 'Extrémna chamtivosť';
  return {
    key: 'sentiment', label: 'Sentiment', weight: w,
    score: Math.round(score),
    detail: `F&G ${Math.round(score)} · ${label}`,
  };
}

function momentumFactor(inputs: MondayInputs, w: number): FactorBreakdown {
  // Prefer 30D momentum (regime concept), fall back to 7D.
  const ch = inputs.btc30dChangePct ?? inputs.btc7dChangePct ?? 0;
  // +0% → 50, +20% → 80, +40% → 100, −20% → 20, −40% → 0
  const score = clamp(50 + ch * 1.5);
  const window = inputs.btc30dChangePct !== undefined ? '30D' : '7D';
  return {
    key: 'momentum', label: 'Momentum', weight: w,
    score: Math.round(score),
    detail: `BTC ${window} ${ch >= 0 ? '+' : ''}${ch.toFixed(1)} %`,
  };
}

function riskAppetiteFactor(inputs: MondayInputs, w: number): FactorBreakdown {
  const eth = inputs.eth24hChangePct ?? 0;
  const sol = inputs.sol24hChangePct ?? 0;
  const btc = inputs.btc24hChangePct ?? 0;
  const altAvg = (eth + sol) / 2;
  const diff = altAvg - btc;
  const score = clamp(50 + diff * 5);
  return {
    key: 'risk_appetite', label: 'Risk Appetite', weight: w,
    score: Math.round(score),
    detail: `Alt − BTC ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} pp`,
  };
}

export function computeFactors(inputs: MondayInputs, regime: Regime): FactorBreakdown[] {
  const w = REGIME_WEIGHTS[regime];
  return [
    valuationFactor(inputs, w.valuation),
    trendFactor(inputs, w.trend),
    sentimentFactor(inputs, w.sentiment),
    momentumFactor(inputs, w.momentum),
    riskAppetiteFactor(inputs, w.risk_appetite),
  ];
}

export function computeFactorScore(factors: FactorBreakdown[]): number {
  const weighted = factors.reduce((s, f) => s + f.score * f.weight, 0);
  return Math.round(clamp(weighted));
}

// ============================================================
// 4) SMOOTH ALLOCATION FORMULA
//    Allocation % = 82 - (Score × 0.62)   clamped [22, 80]
//    Overrides:
//      Panic + score < 15  → 85 %
//      Euphoria + score > 90 → 20 %
// ============================================================

export interface AllocationTuning {
  minAllocationPct?: number;       // default 22
  maxAllocationPct?: number;       // default 80
  highScoreReducerPct?: number;    // subtract from raw when score > 75
  maReclaimBonusPct?: number;      // add when BTC just reclaimed 200D MA
  maReclaimActive?: boolean;
}

export function smoothAllocation(score: number, _regime?: Regime, tuning?: AllocationTuning): {
  pct: number;
  override: 'panic_floor' | 'euphoria_ceiling' | null;
} {
  void tuning;
  const pct = continuousBudgetPct(score);
  return { pct, override: null };
}

// ============================================================
// 5) CONFIDENCE ENGINE — factor agreement
//    High = factors aligned (low spread)  → ×1.00
//    Medium                                 → ×0.93
//    Low  = contradictory                   → ×0.85
// ============================================================

export interface ConfidenceTuning {
  low?: number;   // default 0.85
  med?: number;   // default 0.93
  high?: number;  // default 1.00
}

export function computeConfidence(factors: FactorBreakdown[], tuning?: ConfidenceTuning): {
  level: ConfidenceLevel;
  agreement: number;     // 0..1
  multiplier: number;
} {
  const totalW = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const mean = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalW;
  const variance = factors.reduce((s, f) => s + f.weight * (f.score - mean) ** 2, 0) / totalW;
  const stdev = Math.sqrt(variance);
  const agreement = clamp(1 - stdev / 30, 0, 1);

  const lowM = tuning?.low ?? 0.85;
  const medM = tuning?.med ?? 0.93;
  const highM = tuning?.high ?? 1.00;

  let level: ConfidenceLevel;
  let multiplier: number;
  if (agreement >= 0.7)      { level = 'high';   multiplier = highM; }
  else if (agreement >= 0.45){ level = 'medium'; multiplier = medM; }
  else                       { level = 'low';    multiplier = lowM; }
  return { level, agreement, multiplier };
}

function limitDiscountFor(regime: Regime, defaultPct?: number): number {
  const def = defaultPct ?? 4;
  switch (regime) {
    case 'panic':    return 2.5;
    case 'bear':     return Math.max(def, 5);
    case 'bull':     return Math.min(def, 3);
    case 'euphoria': return def;
    case 'sideways': return def;
  }
}

// ============================================================
// 7) RATIONALE (short, deterministic)
// ============================================================

function rationaleFor(p: {
  regime: Regime;
  score: number;
  basePct: number;
  finalPct: number;
  conf: ConfidenceLevel;
  capital: number;
}): string {
  const head = `Režim ${REGIME_LABEL_SK[p.regime]} · skóre ${p.score}/100`;
  const confTxt = p.conf === 'high' ? 'vysoká zhoda faktorov'
    : p.conf === 'medium' ? 'mierne rozporné faktory'
    : 'rozporné faktory';
  const tail = p.finalPct === Math.round(p.basePct)
    ? ''
    : ` · confidence ×${p.conf === 'high' ? '1.00' : p.conf === 'medium' ? '0.93' : '0.85'} (${confTxt})`;
  return `${head}. ${budgetWhyText(p.score, p.finalPct, p.capital)}${tail}`;
}

// ============================================================
// MAIN BUILD
// ============================================================

export interface BuildPlanTuning {
  minAllocationPct?: number;
  maxAllocationPct?: number;
  confLowMult?: number;
  confMedMult?: number;
  confHighMult?: number;
  limitDiscountDefaultPct?: number;
  highScoreReducerPct?: number;
  maReclaimBonusPct?: number;
  maReclaimActive?: boolean;
}

export function buildPlan(
  inputs: MondayInputs,
  prices?: PriceData,
  prevDeploymentPct?: number,
  tuning?: BuildPlanTuning,
): MondayPlan {
  const regime = detectRegime(inputs);
  const factors = computeFactors(inputs, regime);
  const factorScore = computeFactorScore(factors);

  const { pct: basePct, override } = smoothAllocation(factorScore, regime, {
    minAllocationPct: tuning?.minAllocationPct,
    maxAllocationPct: tuning?.maxAllocationPct,
    highScoreReducerPct: tuning?.highScoreReducerPct,
    maReclaimBonusPct: tuning?.maReclaimBonusPct,
    maReclaimActive: tuning?.maReclaimActive,
  });
  const conf = computeConfidence(factors, {
    low: tuning?.confLowMult,
    med: tuning?.confMedMult,
    high: tuning?.confHighMult,
  });

  const finalPctRaw = basePct * conf.multiplier;
  const finalPct = Math.round(clamp(finalPctRaw, 0, 100));
  const finalFraction = finalPct / 100;

  const investableUsd = inputs.capital * finalFraction;
  const reservedUsd = inputs.capital - investableUsd;
  const marketUsd = investableUsd * MARKET_SPLIT;
  const limitUsd = investableUsd * LIMIT_SPLIT;

  const tokenSplit = continuousTokenSplit(factorScore);

  // Regime-based baseline discount (applied to BTC; ETH/SOL get +1pp/+2pp minimum spread).
  const regimeBaselinePct = limitDiscountFor(regime, tuning?.limitDiscountDefaultPct);

  // Minimálne spready oproti BTC — musí korešpondovať s dynamicLimits.ts
  const MIN_SPREAD_VS_BTC: Record<string, number> = { btc: 0, eth: 1, sol: 2 };

  // BTC efektívny discount = max(regime baseline, dynamický z volatility)
  const btcDynPct = getEffectiveLimitInfo(TOKENS[0]).discountPct;
  const btcDiscountPct = Math.max(regimeBaselinePct, btcDynPct);

  const perAsset: AssetPlan[] = TOKENS.map(t => {
    const weight = tokenWeightFraction(t.symbol, tokenSplit);
    const assetMarket = marketUsd * weight;
    const assetLimit = limitUsd * weight;
    const livePrice = prices?.[t.coingeckoId]?.usd;
    const currentPrice = livePrice && livePrice > 0
      ? livePrice
      : (t.coingeckoId === 'bitcoin' ? inputs.btcPrice : 0);

    // Per-asset dynamický discount + vynútený spread vs BTC
    const dynPct = getEffectiveLimitInfo(t).discountPct;
    const spread = MIN_SPREAD_VS_BTC[t.id] ?? 0;
    const minRequired = btcDiscountPct + spread;
    const assetDiscountPct = Math.max(dynPct, minRequired);

    const limitMultiplier = 1 - assetDiscountPct / 100;
    const limitPrice = currentPrice * limitMultiplier;
    return {
      symbol: t.symbol,
      name: t.name,
      color: t.color,
      coingeckoId: t.coingeckoId,
      weight,
      marketUsd: assetMarket,
      limitUsd: assetLimit,
      currentPrice,
      limitPrice,
      limitDiscountPct: Math.round(assetDiscountPct * 10) / 10,
      marketQty: currentPrice > 0 ? assetMarket / currentPrice : 0,
      limitQty: limitPrice > 0 ? assetLimit / limitPrice : 0,
    };
  });

  // Top-level limitDiscountPct = BTC reference (per-asset hodnoty sú v perAsset)
  const limitDiscountPct = Math.round(btcDiscountPct * 10) / 10;

  // Legacy band mapping — kept for back-compat (history exports/UI fallbacks).
  const band: ValuationBand =
    factorScore <= 25 ? 'deep_value'
    : factorScore <= 45 ? 'accumulation'
    : factorScore <= 65 ? 'neutral'
    : factorScore <= 80 ? 'expensive'
    : 'euphoria';

  return {
    regime,
    regimeLabel: REGIME_LABEL_SK[regime],
    regimeShort: REGIME_SHORT[regime],

    factors,
    factorScore,

    baseAllocationPct: basePct,
    confidence: conf.level,
    confidenceAgreement: conf.agreement,
    confidenceMultiplier: conf.multiplier,
    finalAllocationPct: finalPct,
    overrideTriggered: override,

    limitDiscountPct,
    investableUsd,
    reservedUsd,
    marketUsd,
    limitUsd,
    perAsset,

    rationale: rationaleFor({
      regime, score: factorScore, basePct, finalPct,
      conf: conf.level, capital: inputs.capital,
    }),

    // Back-compat
    valuationScore: factorScore,
    band,
    bandLabel: bandLabel(band),
    regimeLabel_legacy: REGIME_SHORT[regime],
    deploymentPct: finalFraction,
    rawDeploymentPct: basePct / 100,
    stabilityClamped: false,
    panicMode: regime === 'panic' || regime === 'euphoria',
    prevDeploymentPct,
    trendFilterActive: false,
    trendFilterReason: null,
    trendFilterCapPct: null,
    trendFilterBypassed: false,
    preTrendFilterPct: basePct / 100,
    stressScore: factorScore,
  };
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

// ============================================================
// HISTORY (persisted in localStorage)
// ============================================================

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
    regime?: Regime;
    confidence?: ConfidenceLevel;
    stressScore?: number;
  };
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryEntry[];
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
  const headers = ['date', 'capital', 'btcPrice', 'btc30dHigh', 'fearGreed', 'above200dMA', 'regime', 'confidence', 'score', 'band', 'allocationPct', 'investableUsd', 'reservedUsd'];
  const rows = history.map(h => [
    h.date,
    h.inputs.capital,
    h.inputs.btcPrice,
    h.inputs.btc30dHigh,
    h.inputs.fearGreed,
    h.inputs.btcAbove200dMA ? 'Y' : 'N',
    h.plan.regime ?? '',
    h.plan.confidence ?? '',
    h.plan.valuationScore,
    h.plan.band,
    Math.round(h.plan.deploymentPct * 100),
    h.plan.investableUsd.toFixed(2),
    h.plan.reservedUsd.toFixed(2),
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
