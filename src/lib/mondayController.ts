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

export interface RegimeBounds {
  minPct: number;
  maxPct: number;
}

/**
 * Continuous Cap Expansion — market distress fluidly stretches the regime Max
 * ceiling toward 100 % so a long-term DCA investor can accumulate the discount.
 * No booleans, no thresholds: distressFactor moves smoothly in [0..1].
 */
export interface BoundStretchState {
  /** distressFactor > 0 (informational only — never a gate) */
  active: boolean;
  riskScore: number;
  sentimentScore: number;
  /** 0.0 … 1.0 continuous distress */
  distressFactor: number;
  /** regime Max before stretching */
  baseMaxPct: number;
  /** Regime_Max + (100 − Regime_Max) × distressFactor */
  effectiveMaxPct: number;
}

/** @deprecated legacy aliases — kept for type compatibility */
export type BlackSwanState = BoundStretchState;
export type RiskVetoState = BoundStretchState;

export interface AllocationWaterfall {
  score: number;
  basePct: number;          // continuous sigmoid output (already inside regime bounds)
  bounds: RegimeBounds;
  factorStdev: number;
  confidenceMultiplier: number;
  afterMultiplierPct: number;
  boundStretch: BoundStretchState;
  finalPct: number;
}

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
  regimeBounds: RegimeBounds;
  factorStdev: number;
  boundStretch: BoundStretchState;
  waterfall: AllocationWaterfall;
  confidence: ConfidenceLevel;
  confidenceAgreement: number; // 0..1 (how aligned the factors are)
  confidenceMultiplier: number; // continuous 0.70 .. 1.10
  finalAllocationPct: number; // after confidence multiplier (rounded whole %)
  overrideTriggered: 'panic_floor' | 'euphoria_ceiling' | 'bounds_stretched' | null;


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
// 4) CONTINUOUS ALLOCATION CURVE (inverted sigmoid, no steps)
//
//    base01 = 1 / (1 + e^((score − 50) / K))     K = 14 (softness)
//    pct    = min + (max − min) × base01
//
//    Regime bounds (adaptive Min/Max):
//      BULL 30–100 · BEAR 5–60 · SIDEWAYS 15–75 · PANIC 10–95 · EUPHORIA 0–20
// ============================================================

export const REGIME_BOUNDS: Record<Regime, RegimeBounds> = {
  bull:     { minPct: 30, maxPct: 100 },
  bear:     { minPct: 5,  maxPct: 60 },
  sideways: { minPct: 15, maxPct: 75 },
  panic:    { minPct: 10, maxPct: 95 },
  euphoria: { minPct: 0,  maxPct: 20 },
};

const SIGMOID_SOFTNESS = 14; // higher = gentler slope; 1 score point ⇒ fractional %

export interface AllocationTuning {
  minAllocationPct?: number;       // optional narrowing inside regime bounds
  maxAllocationPct?: number;
  highScoreReducerPct?: number;    // continuous extra defensiveness at high scores
  maReclaimBonusPct?: number;      // add when BTC just reclaimed 200D MA
  maReclaimActive?: boolean;
}

/** Inverted sigmoid: low score → high allocation, high score → low allocation. */
export function allocationCurve01(score: number): number {
  const s = clamp(score, 0, 100);
  return 1 / (1 + Math.exp((s - 50) / SIGMOID_SOFTNESS));
}

export function smoothAllocation(score: number, regime: Regime, tuning?: AllocationTuning): {
  pct: number;
  bounds: RegimeBounds;
  override: null;
} {
  const regimeB = REGIME_BOUNDS[regime];
  // Optional tuning can only narrow inside the regime mantinels (capital protection).
  const lo = Math.max(regimeB.minPct, tuning?.minAllocationPct ?? regimeB.minPct);
  const hi = Math.min(regimeB.maxPct, Math.max(lo, tuning?.maxAllocationPct ?? regimeB.maxPct));
  const bounds: RegimeBounds = { minPct: lo, maxPct: hi };

  let raw = lo + (hi - lo) * allocationCurve01(score);

  // Continuous (not stepped) tuning adjustments.
  if (tuning?.highScoreReducerPct) {
    // fades in smoothly above score 60, full weight at 100
    const w = clamp((score - 60) / 40, 0, 1);
    raw -= tuning.highScoreReducerPct * w;
  }
  if (tuning?.maReclaimActive && tuning?.maReclaimBonusPct) raw += tuning.maReclaimBonusPct;

  return { pct: clamp(raw, lo, hi), bounds, override: null };
}

// ============================================================
// 5) FACTOR CONFLUENCE — continuous confidence multiplier
//    stdev across the 5 factor scores → multiplier 1.10 … 0.70
// ============================================================

export interface ConfidenceTuning {
  low?: number;   // floor multiplier, default 0.70
  med?: number;   // unused (legacy)
  high?: number;  // ceiling multiplier, default 1.10
}

export function factorStdev(factors: FactorBreakdown[]): number {
  if (factors.length === 0) return 0;
  const mean = factors.reduce((s, f) => s + f.score, 0) / factors.length;
  const variance = factors.reduce((s, f) => s + (f.score - mean) ** 2, 0) / factors.length;
  return Math.sqrt(variance);
}

export function computeConfidence(factors: FactorBreakdown[], tuning?: ConfidenceTuning): {
  level: ConfidenceLevel;
  agreement: number;     // 0..1
  multiplier: number;    // continuous
  stdev: number;
} {
  const stdev = factorStdev(factors);
  // 0 stdev = perfect confluence, ≥35 stdev = chaos
  const chaos = clamp(stdev / 35, 0, 1);
  const agreement = 1 - chaos;

  const floorM = tuning?.low ?? 0.70;
  const ceilM = tuning?.high ?? 1.10;
  // smoothstep for a soft, continuous transition
  const smooth = chaos * chaos * (3 - 2 * chaos);
  const multiplier = ceilM - (ceilM - floorM) * smooth;

  const level: ConfidenceLevel = agreement >= 0.7 ? 'high' : agreement >= 0.45 ? 'medium' : 'low';
  return { level, agreement, multiplier, stdev };
}

// ============================================================
// 6) CONTINUOUS CAP EXPANSION — fluid Black Swan accumulation
//    distressFactor blends Risk (60 → 100) and inverted Sentiment (40 → 0)
//    through a smoothstep, then stretches the regime Max toward 100 %:
//      Effective_Max = Regime_Max + (100 − Regime_Max) × distressFactor
// ============================================================

/** Smoothstep — C1-continuous ramp, no steps at the edges. */
function smoothstep(x: number, edge0: number, edge1: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export const DISTRESS_RISK_RANGE: [number, number] = [60, 100];
export const DISTRESS_SENTIMENT_RANGE: [number, number] = [40, 0];

/** Continuous distress in [0..1] from Risk + inverted Sentiment. */
export function computeDistressFactor(factors: FactorBreakdown[]): {
  distressFactor: number; riskScore: number; sentimentScore: number;
} {
  const risk = factors.find(f => f.key === 'risk_appetite')?.score ?? 0;
  const sentiment = factors.find(f => f.key === 'sentiment')?.score ?? 50;
  const riskPart = smoothstep(risk, DISTRESS_RISK_RANGE[0], DISTRESS_RISK_RANGE[1]);
  const sentPart = smoothstep(sentiment, DISTRESS_SENTIMENT_RANGE[0], DISTRESS_SENTIMENT_RANGE[1]);
  // Probabilistic OR — smooth, saturating, never stepped.
  const distressFactor = clamp(1 - (1 - riskPart) * (1 - sentPart), 0, 1);
  return { distressFactor, riskScore: risk, sentimentScore: sentiment };
}

/** Fluidly stretch the regime Max ceiling toward 100 % as distress rises. */
export function computeBoundStretch(factors: FactorBreakdown[], baseMaxPct: number): BoundStretchState {
  const { distressFactor, riskScore, sentimentScore } = computeDistressFactor(factors);
  const effectiveMaxPct = clamp(baseMaxPct + (100 - baseMaxPct) * distressFactor, 0, 100);
  return {
    active: distressFactor > 0.01,
    riskScore,
    sentimentScore,
    distressFactor,
    baseMaxPct,
    effectiveMaxPct,
  };
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
  stdev: number;
  mult: number;
  bounds: RegimeBounds;
  stretch: BoundStretchState;
}): string {
  const head = `Režim ${REGIME_LABEL_SK[p.regime]} · skóre ${p.score}/100`;
  const stretchTxt = p.stretch.distressFactor > 0.01
    ? ` Mantinely plynule roztiahnuté z Max ${p.stretch.baseMaxPct.toFixed(0)} % na Max ${p.stretch.effectiveMaxPct.toFixed(0)} % `
      + `(distress ${(p.stretch.distressFactor * 100).toFixed(0)} % · Risk ${p.stretch.riskScore}, Sentiment ${p.stretch.sentimentScore}) — extrémna zľava, akumulujeme.`
    : '';
  const confTxt = p.conf === 'high' ? 'faktory v zhode'
    : p.conf === 'medium' ? 'mierne rozporné faktory'
    : 'rozporné faktory (chaos)';
  return `${head}. Spojitá sigmoidná krivka → základ ${p.basePct.toFixed(1)} % v mantineloch ${p.bounds.minPct}–${p.bounds.maxPct} %, `
    + `confidence ×${p.mult.toFixed(2)} (rozptyl σ ${p.stdev.toFixed(1)}, ${confTxt}) → finálne ${p.finalPct} %.${stretchTxt}`;
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

  const { pct: basePct, bounds } = smoothAllocation(factorScore, regime, {
    minAllocationPct: tuning?.minAllocationPct,
    maxAllocationPct: tuning?.maxAllocationPct,
    highScoreReducerPct: tuning?.highScoreReducerPct,
    maReclaimBonusPct: tuning?.maReclaimBonusPct,
    maReclaimActive: tuning?.maReclaimActive,
  });
  // Confidence range is fixed by the quant spec (0.70 … 1.10) — no stepped legacy tuning.
  const conf = computeConfidence(factors);

  // Continuous Cap Expansion: distress fluidly lifts the regime Max toward 100 %.
  const stretch = computeBoundStretch(factors, bounds.maxPct);
  const effectiveBounds: RegimeBounds = {
    minPct: bounds.minPct,
    maxPct: Math.max(bounds.minPct, stretch.effectiveMaxPct),
  };

  // Sigmoid synergy — the same continuous curve, now inside the stretched band.
  const rawBase = effectiveBounds.minPct
    + (effectiveBounds.maxPct - effectiveBounds.minPct) * allocationCurve01(factorScore);

  const afterMultiplier = clamp(
    rawBase * conf.multiplier,
    effectiveBounds.minPct,
    effectiveBounds.maxPct,
  );
  const finalPctRaw = afterMultiplier;
  const override: MondayPlan['overrideTriggered'] = stretch.distressFactor > 0.01 ? 'bounds_stretched' : null;
  const finalPct = Math.round(clamp(finalPctRaw, 0, 100));
  const finalFraction = finalPct / 100;


  const investableUsd = inputs.capital * finalFraction;
  const reservedUsd = inputs.capital - investableUsd;
  const marketUsd = investableUsd * MARKET_SPLIT;
  const limitUsd = investableUsd * LIMIT_SPLIT;

  // Regime-based baseline discount (applied to BTC; ETH/SOL get +1pp/+2pp minimum spread).
  const regimeBaselinePct = limitDiscountFor(regime, tuning?.limitDiscountDefaultPct);

  // Minimálne spready oproti BTC — musí korešpondovať s dynamicLimits.ts
  const MIN_SPREAD_VS_BTC: Record<string, number> = { btc: 0, eth: 1, sol: 2 };

  // BTC efektívny discount = max(regime baseline, dynamický z volatility)
  const btcDynPct = getEffectiveLimitInfo(TOKENS[0]).discountPct;
  const btcDiscountPct = Math.max(regimeBaselinePct, btcDynPct);

  const perAsset: AssetPlan[] = TOKENS.map(t => {
    const assetMarket = marketUsd * t.allocation;
    const assetLimit = limitUsd * t.allocation;
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
      weight: t.allocation,
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

    baseAllocationPct: rawBase,
    regimeBounds: effectiveBounds,
    factorStdev: conf.stdev,
    boundStretch: stretch,
    waterfall: {
      score: factorScore,
      basePct: rawBase,
      bounds: effectiveBounds,
      factorStdev: conf.stdev,
      confidenceMultiplier: conf.multiplier,
      afterMultiplierPct: afterMultiplier,
      boundStretch: stretch,
      finalPct,
    },
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
      regime, score: factorScore, basePct: rawBase, finalPct,
      conf: conf.level, stdev: conf.stdev, mult: conf.multiplier,
      bounds: effectiveBounds, stretch,
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
