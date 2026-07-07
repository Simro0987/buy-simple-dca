// Dynamic Per-Coin Execution Engine
// Calculates Market/Limit split and limit distance per coin based on:
// 1) Final Score (0-100) → base split
// 2) Per-coin 14D volatility → distance multiplier
// 3) Per-coin 14D momentum → market% adjustment

export type CoinKey = 'btc' | 'eth' | 'sol';

export interface MultiplierBreakdown {
  T: -1 | 0 | 1;          // trend: 1 bull, 0 neutral, -1 bear
  VR: number;             // volatility ratio vs BTC (>=0)
  fill: number;           // historical fill rate 0..1
  base: number;           // base multiplier (trend tier)
  vol: number;            // volatility adjustment factor
  fb: number;             // feedback-loop factor
  total: number;          // base * vol * fb
}

export interface CoinExecution {
  coin: CoinKey;
  symbol: 'BTC' | 'ETH' | 'SOL';
  marketPct: number;       // 25-90
  limitPct: number;        // 100 - marketPct
  limitDistancePct: number; // negative, e.g. -4.0
  volatility30d: number;   // %, std-dev daily returns
  momentum30d: number;     // %, price change vs 30d ago
  baseMarketPct: number;
  baseLimitPct: number;
  baseDistance: number;
  volatilityMultiplier: number;
  momentumAdjustment: number;
  rationale: string;
  /** Set for ETH/SOL when computed via executive multiplier formulas. */
  multiplierBreakdown?: MultiplierBreakdown;
}

export interface FillRates {
  eth: number; // 0..1
  sol: number; // 0..1
}

/** Trend tier from 14D momentum: >+3% bull, <-3% bear, else neutral. */
export function getTrendTier(momentum30d: number): -1 | 0 | 1 {
  if (momentum30d > 3) return 1;
  if (momentum30d < -3) return -1;
  return 0;
}

/** Volatility ratio vs BTC, floored at 0 (asset = BTC → 0, asset = 2×BTC → 1). */
export function getVolatilityRatio(assetVol: number, btcVol: number): number {
  if (!btcVol || btcVol <= 0) return 0;
  return Math.max(0, assetVol / btcVol - 1);
}

/**
 * ETH multiplier:
 *   base = T==1 ? 1.20 : T==0 ? 1.25 : 1.28
 *   total = base * (1 + VR*0.05) * (1 + (0.50 - ETH_Fill) * 0.2)
 */
export function ethMultiplier(T: -1 | 0 | 1, VR: number, ethFill: number): MultiplierBreakdown {
  const base = T === 1 ? 1.20 : T === 0 ? 1.25 : 1.28;
  const vol = 1 + VR * 0.05;
  const fb = 1 + (0.50 - ethFill) * 0.2;
  return { T, VR, fill: ethFill, base, vol, fb, total: base * vol * fb };
}

/**
 * SOL multiplier:
 *   base = T==1 ? 1.35 : T==0 ? 1.50 : 1.55
 *   total = base * (1 + VR*0.08) * (1 + (0.50 - SOL_Fill) * 0.3)
 */
export function solMultiplier(T: -1 | 0 | 1, VR: number, solFill: number): MultiplierBreakdown {
  const base = T === 1 ? 1.35 : T === 0 ? 1.50 : 1.55;
  const vol = 1 + VR * 0.08;
  const fb = 1 + (0.50 - solFill) * 0.3;
  return { T, VR, fill: solFill, base, vol, fb, total: base * vol * fb };
}

export interface BaseSplit {
  marketPct: number;
  limitPct: number;
  distance: number; // negative
}

/** Adaptive overrides z DB engine_params. */
export interface AdaptiveOverrides {
  baseMarketHigh?: number;     // default 85
  baseMarketLow?: number;      // default 30
  baseDistanceLow?: number;    // default -1.5
  baseDistanceHigh?: number;   // default -6.5
  volatilitySensitivity?: number; // default 0.25
  momentumSensitivity?: number;   // default 0.6
}

const DEFAULTS: Required<AdaptiveOverrides> = {
  baseMarketHigh: 85,
  baseMarketLow: 30,
  baseDistanceLow: -1.5,
  baseDistanceHigh: -6.5,
  volatilitySensitivity: 0.25,
  momentumSensitivity: 0.6,
};

let CURRENT_OVERRIDES: Required<AdaptiveOverrides> = { ...DEFAULTS };

/** Voliteľne nastav adaptive parametre z DB (volá sa raz pri načítaní engine_params). */
export function setAdaptiveOverrides(o: AdaptiveOverrides | null | undefined): void {
  CURRENT_OVERRIDES = {
    baseMarketHigh: o?.baseMarketHigh ?? DEFAULTS.baseMarketHigh,
    baseMarketLow: o?.baseMarketLow ?? DEFAULTS.baseMarketLow,
    baseDistanceLow: o?.baseDistanceLow ?? DEFAULTS.baseDistanceLow,
    baseDistanceHigh: o?.baseDistanceHigh ?? DEFAULTS.baseDistanceHigh,
    volatilitySensitivity: o?.volatilitySensitivity ?? DEFAULTS.volatilitySensitivity,
    momentumSensitivity: o?.momentumSensitivity ?? DEFAULTS.momentumSensitivity,
  };
}

/**
 * Kontinuálny base split — žiadne skokové pásma. Hodnoty riadi adaptívny engine
 * (engine_params v DB). Defaults: 85→30 market, -1.5→-6.5 distance.
 */
export function getBaseSplit(score: number): BaseSplit {
  const s = Math.max(0, Math.min(100, score));
  const t = s / 100; // 0..1
  const { baseMarketHigh, baseMarketLow, baseDistanceLow, baseDistanceHigh } = CURRENT_OVERRIDES;
  const marketPct = Math.round(baseMarketHigh - (baseMarketHigh - baseMarketLow) * t);
  const distance = baseDistanceLow - (Math.abs(baseDistanceHigh) - Math.abs(baseDistanceLow)) * t;
  return {
    marketPct,
    limitPct: 100 - marketPct,
    distance: Math.round(distance * 10) / 10,
  };
}

/**
 * Kontinuálny multiplier (nie skokový) — aj malý rozdiel vol medzi BTC/ETH/SOL
 * generuje viditeľne odlišný limit distance.
 * Mapovanie: vol 0% → 0.5×, vol 2% → 1.0×, vol 4% → 1.5×, vol 6%+ → 2.0× (cap).
 */
export function getVolatilityMultiplier(vol30d: number): number {
  const sens = CURRENT_OVERRIDES.volatilitySensitivity;
  const mult = 0.5 + vol30d * sens;
  return Math.max(0.5, Math.min(2.0, mult));
}

/**
 * Kontinuálny momentum adjustment na Market% — koeficient riadi engine_params.
 * mom 0 % → 0, |mom| × momentumSensitivity, cap ±15.
 */
export function getMomentumAdjustment(mom30d: number): number {
  const sens = CURRENT_OVERRIDES.momentumSensitivity;
  const adj = Math.abs(mom30d) * sens;
  return Math.max(0, Math.min(15, Math.round(adj * 10) / 10));
}

const SYMBOLS: Record<CoinKey, 'BTC' | 'ETH' | 'SOL'> = {
  btc: 'BTC', eth: 'ETH', sol: 'SOL',
};

export interface CoinMetrics {
  volatility30d: number;
  momentum30d: number;
}

/**
 * Per-coin execution.
 * Market% / Limit% sú **rovnaké pre všetky tokeny** (riadi ich celkové Score + agregované momentum) —
 * splity sa menia v čase podľa indikátorov, ale v rámci jedného týždňa sú konzistentné naprieč coins.
 * Limit Distance % je **per-coin** — riadi ho 14D volatilita daného tokenu (volatilnejší token = širší distance).
 *
 * @param sharedMomentumAdj voliteľný spoločný momentum adjustment (z agregátu BTC+ETH+SOL).
 *                          Ak nie je daný, použije sa per-coin momentum (legacy).
 */
export function calcCoinExecution(
  coin: CoinKey,
  score: number,
  metrics: CoinMetrics,
  sharedMomentumAdj?: number,
): CoinExecution {
  const base = getBaseSplit(score);
  const volMult = getVolatilityMultiplier(metrics.volatility30d);
  const momAdj = sharedMomentumAdj ?? getMomentumAdjustment(metrics.momentum30d);

  // Per-coin momentum bias na DISTANCE — kontinuálne, žiadne pásma.
  //   downtrend (m<0) → multiplier > 1 (širší limit, čakaj nižšiu cenu)
  //   uptrend   (m>0) → multiplier < 1 (tesnejší limit, chyť trend)
  // Lineárne: mult = 1 - m/50, clamp [0.75, 1.25]
  const m = metrics.momentum30d;
  const momDistMult = Math.max(0.75, Math.min(1.25, 1 - m / 50));

  // Distance: PER-COIN — base × per-coin volatility × per-coin momentum, clamp [-10, -1.5]
  const rawDist = base.distance * volMult * momDistMult;
  const distance = Math.round(Math.max(-10, Math.min(-1.5, rawDist)) * 10) / 10;

  // Market%: SHARED — base + shared adjustment, clamp [25, 90]
  // Zaokrúhľujeme na celé čísla, aby Market + Limit = 100 % vždy presne.
  const rawMarket = base.marketPct + momAdj;
  const marketPct = Math.round(Math.max(25, Math.min(90, rawMarket)));
  const limitPct = 100 - marketPct;

  // Per-coin rationale: vol + momentum (rovnaká pre BTC/ETH/SOL)
  const volPart =
    metrics.volatility30d >= 4 ? `vysoká 14D vol ${metrics.volatility30d.toFixed(1)}%`
    : metrics.volatility30d >= 2.5 ? `stredná 14D vol ${metrics.volatility30d.toFixed(1)}%`
    : metrics.volatility30d >= 1.5 ? `nižšia 14D vol ${metrics.volatility30d.toFixed(1)}%`
    : `nízka 14D vol ${metrics.volatility30d.toFixed(1)}%`;
  const momPart =
    m < -10 ? `silný downtrend ${m.toFixed(1)}% → širší limit`
    : m < -3 ? `mierny downtrend ${m.toFixed(1)}% → mierne širší limit`
    : m <= 3 ? `neutrálne momentum ${m.toFixed(1)}%`
    : m <= 10 ? `mierny uptrend +${m.toFixed(1)}% → tesnejší limit`
    : `silný uptrend +${m.toFixed(1)}% → tesný limit`;
  const rationale = `${volPart} + ${momPart} → distance ${distance.toFixed(1)}%.`;

  return {
    coin,
    symbol: SYMBOLS[coin],
    marketPct,
    limitPct,
    limitDistancePct: distance,
    volatility30d: metrics.volatility30d,
    momentum30d: metrics.momentum30d,
    baseMarketPct: base.marketPct,
    baseLimitPct: base.limitPct,
    baseDistance: base.distance,
    volatilityMultiplier: volMult,
    momentumAdjustment: momAdj,
    rationale,
  };
}

/**
 * Vypočíta jednotný Market/Limit % split pre všetky tokeny + per-coin distance.
 * Toto je hlavná vstupná funkcia (Part 6).
 */
export function calcUnifiedExecution(
  score: number,
  metrics: Record<CoinKey, CoinMetrics>,
  fillRates: FillRates = { eth: 0.5, sol: 0.5 },
): {
  executions: Record<CoinKey, CoinExecution>;
  sharedMarketPct: number;
  sharedLimitPct: number;
  sharedMomentumAvg: number;
  sharedMomentumAdj: number;
  base: BaseSplit;
} {
  const coins: CoinKey[] = ['btc', 'eth', 'sol'];
  // Agregované momentum (priemer per-coin) — riadi spoločný Market% adjustment
  const avgMom = coins.reduce((s, c) => s + (metrics[c]?.momentum30d ?? 0), 0) / coins.length;
  const sharedMomAdj = getMomentumAdjustment(avgMom);
  const base = getBaseSplit(score);
  const out = {} as Record<CoinKey, CoinExecution>;
  for (const c of coins) {
    out[c] = calcCoinExecution(c, score, metrics[c] ?? { volatility30d: 0, momentum30d: 0 }, sharedMomAdj);
  }

  // Executive formula override for ETH & SOL — limit distance je odvodené od BTC distance
  // násobeného multiplierom z trendu, volatility ratio a fill-rate feedback loop.
  const btcDist = out.btc.limitDistancePct; // negatívne, napr. -3
  const btcVol = metrics.btc?.volatility30d ?? 0;

  const applyMultiplier = (
    c: 'eth' | 'sol',
    bd: MultiplierBreakdown,
  ) => {
    const raw = btcDist * bd.total; // -3 * 1.20 = -3.6
    const distance = Math.round(Math.max(-15, Math.min(-1.5, raw)) * 10) / 10;
    const trendLabel = bd.T === 1 ? 'bull' : bd.T === -1 ? 'bear' : 'neutral';
    out[c] = {
      ...out[c],
      limitDistancePct: distance,
      multiplierBreakdown: bd,
      rationale:
        `Trend ${trendLabel} (base ×${bd.base.toFixed(2)}) · ` +
        `VR ${bd.VR.toFixed(2)} (vol ×${bd.vol.toFixed(3)}) · ` +
        `fill ${(bd.fill * 100).toFixed(0)}% (fb ×${bd.fb.toFixed(3)}) ` +
        `→ mult ×${bd.total.toFixed(3)} × BTC ${btcDist.toFixed(1)}% = ${distance.toFixed(1)}%.`,
    };
  };

  const ethT = getTrendTier(metrics.eth?.momentum30d ?? 0);
  const ethVR = getVolatilityRatio(metrics.eth?.volatility30d ?? 0, btcVol);
  applyMultiplier('eth', ethMultiplier(ethT, ethVR, fillRates.eth));

  const solT = getTrendTier(metrics.sol?.momentum30d ?? 0);
  const solVR = getVolatilityRatio(metrics.sol?.volatility30d ?? 0, btcVol);
  applyMultiplier('sol', solMultiplier(solT, solVR, fillRates.sol));

  // Všetky majú rovnaký marketPct/limitPct
  const shared = out.btc;
  return {
    executions: out,
    sharedMarketPct: shared.marketPct,
    sharedLimitPct: shared.limitPct,
    sharedMomentumAvg: avgMom,
    sharedMomentumAdj: sharedMomAdj,
    base,
  };
}

// Fallback when dynamic engine is OFF
export function fixedExecution(coin: CoinKey): CoinExecution {
  return {
    coin,
    symbol: SYMBOLS[coin],
    marketPct: 60,
    limitPct: 40,
    limitDistancePct: -4,
    volatility30d: 0,
    momentum30d: 0,
    baseMarketPct: 60,
    baseLimitPct: 40,
    baseDistance: -4,
    volatilityMultiplier: 1,
    momentumAdjustment: 0,
    rationale: 'Fixný 60/40 split (Dynamic Engine vypnutý).',
  };
}

export function overallNarrative(executions: CoinExecution[]): string {
  if (executions.length === 0) return '';
  const avgMarket = executions.reduce((s, e) => s + e.marketPct, 0) / executions.length;
  if (avgMarket > 70) return '🟢 Lacný/volatilný trh — uprednostni okamžitú expozíciu.';
  if (avgMarket >= 50) return '🟡 Normálne podmienky — vyvážená exekúcia.';
  return '🔴 Drahý/pokojný trh — buď trpezlivý s limitmi.';
}

// ============================================================
// LONG-TERM WEEKLY DCA — MERGE + INDICATOR ROUTING
// ============================================================
//
// Context: long-term WEEKLY DCA accumulation (not day trading).
//
// Market orders have NO minimum notional — a weekly buy of any size may
// execute immediately. The Dynamic Limit slice is only worth placing as a
// separate patient order once it clears a practical minimum. When the Limit
// slice is strictly below that minimum we MERGE both slices into a single
// order and route the whole weekly amount using short/medium-term indicators:
//
//   • Rule A — Overbought (extreme short-term pump): RSI > 70 OR price strongly
//     overextended above the 50D EMA  → route the merged amount to a single
//     LIMIT order (wait for the inevitable pullback to execute the weekly buy).
//   • Rule B — Normal / neutral / oversold: everything else → route the merged
//     amount to a single MARKET order (fair/discounted price for a long-term
//     investor → execute immediately to secure the weekly accumulation).

/** Practical minimum notional for a standalone Dynamic Limit order (USD). */
export const MIN_LIMIT_USD = 10;
/** Daily RSI at/above this level is "heavily overbought". */
export const RSI_OVERBOUGHT = 70;
/** Price this many % above the 50D EMA counts as "strongly overextended". */
export const EMA_OVEREXTENSION_PCT = 15;

export interface OverboughtInputs {
  /** Daily RSI(14). null/undefined when unavailable for the asset. */
  rsi?: number | null;
  /** % the live price sits above (+) / below (−) the 50D EMA. null when unknown. */
  priceVsEma50Pct?: number | null;
}

export interface OverboughtResult {
  /** True when the asset is heavily overbought (extreme short-term pump). */
  overbought: boolean;
  rsi: number | null;
  priceVsEma50Pct: number | null;
  /** True when at least one indicator was available to evaluate. */
  hasSignal: boolean;
  /** Human-readable reasons behind an overbought verdict (SK). */
  reasons: string[];
}

/**
 * Evaluate the "Overbought vs Normal/Oversold" condition from the existing
 * short/medium-term indicators (daily RSI + distance above the 50D EMA).
 * Missing indicators are treated as "not overbought" so a long-term DCA buy
 * defaults to immediate execution rather than stalling on a limit order.
 */
export function evaluateOverbought(inp: OverboughtInputs): OverboughtResult {
  const rsi = typeof inp.rsi === 'number' && Number.isFinite(inp.rsi) ? inp.rsi : null;
  const ext = typeof inp.priceVsEma50Pct === 'number' && Number.isFinite(inp.priceVsEma50Pct)
    ? inp.priceVsEma50Pct
    : null;

  const rsiOverbought = rsi !== null && rsi > RSI_OVERBOUGHT;
  const emaOverextended = ext !== null && ext > EMA_OVEREXTENSION_PCT;

  const reasons: string[] = [];
  if (rsiOverbought) reasons.push(`RSI ${rsi.toFixed(0)} > ${RSI_OVERBOUGHT}`);
  if (emaOverextended) reasons.push(`+${ext.toFixed(1)} % nad 50D EMA`);

  return {
    overbought: rsiOverbought || emaOverextended,
    rsi,
    priceVsEma50Pct: ext,
    hasSignal: rsi !== null || ext !== null,
    reasons,
  };
}

export type ExecutionRouting = 'market' | 'limit';

export interface MergeSplitResult {
  marketUsd: number;
  dynUsd: number;
  /** True when the two slices were merged into a single order. */
  merged: boolean;
  /** Where a merged weekly amount was routed. null when not merged. */
  routing: ExecutionRouting | null;
}

/**
 * Resolve the final Market / Dynamic-Limit USD split for a single coin under
 * the long-term weekly DCA rules.
 *
 * @param marketUsd  base Market slice (any size — no minimum)
 * @param dynUsd     base Dynamic Limit slice
 * @param overbought indicator verdict (see {@link evaluateOverbought})
 */
export function resolveExecutionSplit(
  marketUsd: number,
  dynUsd: number,
  overbought: boolean,
): MergeSplitResult {
  const m = Math.max(0, Number.isFinite(marketUsd) ? marketUsd : 0);
  const d = Math.max(0, Number.isFinite(dynUsd) ? dynUsd : 0);
  const total = m + d;

  // Limit slice already clears the practical minimum → keep both orders.
  if (d >= MIN_LIMIT_USD) {
    return { marketUsd: m, dynUsd: d, merged: false, routing: null };
  }

  // Nothing to execute (no weekly budget for this coin).
  if (total <= 0) {
    return { marketUsd: 0, dynUsd: 0, merged: false, routing: null };
  }

  // Merge: route the whole weekly amount by indicator.
  if (overbought) {
    // Rule A — locally overheated: place one patient LIMIT, wait for pullback.
    return { marketUsd: 0, dynUsd: total, merged: true, routing: 'limit' };
  }
  // Rule B — fair/discounted for a long-term investor: execute now via MARKET.
  return { marketUsd: total, dynUsd: 0, merged: true, routing: 'market' };
}

// ============================================================
// CONFLUENCE OCTAGON → EXECUTION SPLIT (Market vs Dynamic Limit)
// ============================================================
//
// The Confluence Octagon produces a 0..100 macro score per token (the average
// of its 8 axes). That score dictates the execution split via a smooth SLIDING
// SCALE (linear between two anchors — no hard IF/ELSE breakpoints):
//
//   • LOW score (capitulation / accumulation, ~10) → favour patient LIMIT
//     orders to catch deep liquidation wicks     → 30 % Market / 70 % Limit.
//   • HIGH score (uptrend / greed, ~80+)          → favour MARKET so we don't
//     miss the run                                 → 100 % Market / 0 % Limit.
//
// Per-coin 14D volatility then applies a small bounded ± tilt on top of the
// octagon base (higher vol → slightly more Market to grab liquidity), which
// preserves the existing volatility indicator's influence.

export const OCTAGON_LOW_SCORE = 10;
export const OCTAGON_LOW_MARKET_PCT = 30;
export const OCTAGON_HIGH_SCORE = 80;
export const OCTAGON_HIGH_MARKET_PCT = 100;
/** Volatility (14D daily stdev %) at which the volatility tilt is neutral. */
export const VOL_BASELINE_PCT = 2.5;
/** Max ± tilt (pp) that per-coin volatility can add on top of the octagon base. */
export const VOL_TILT_MAX_PP = 10;

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Smooth (linear) mapping from a 0..100 Confluence Octagon score to the base
 * MARKET percentage of the execution split. Clamped to
 * [OCTAGON_LOW_MARKET_PCT, OCTAGON_HIGH_MARKET_PCT] i.e. [30, 100].
 */
export function octagonMarketPct(octagonScore: number): number {
  const s = clampNum(Number.isFinite(octagonScore) ? octagonScore : 50, 0, 100);
  const slope = (OCTAGON_HIGH_MARKET_PCT - OCTAGON_LOW_MARKET_PCT) / (OCTAGON_HIGH_SCORE - OCTAGON_LOW_SCORE);
  const raw = OCTAGON_LOW_MARKET_PCT + (s - OCTAGON_LOW_SCORE) * slope;
  return clampNum(raw, OCTAGON_LOW_MARKET_PCT, OCTAGON_HIGH_MARKET_PCT);
}

export interface ExecutionSplitBreakdown {
  marketPct: number;
  limitPct: number;
  octagonScore: number;
  /** MARKET % contributed purely by the octagon score (before the vol tilt). */
  octagonMarketPct: number;
  /** Volatility tilt actually applied, in percentage points. */
  volTiltPp: number;
}

/**
 * Execution split (Market vs Dynamic Limit) for one coin. The base is dictated
 * by the Confluence Octagon score (sliding scale); per-coin 14D volatility adds
 * a bounded ± tilt. Result MARKET % is clamped to [30, 100].
 */
export function executionSplitFromOctagon(
  octagonScore: number,
  volatility30d: number = VOL_BASELINE_PCT,
): ExecutionSplitBreakdown {
  const base = octagonMarketPct(octagonScore);
  const vol = Number.isFinite(volatility30d) ? volatility30d : VOL_BASELINE_PCT;
  const volTilt = clampNum((vol - VOL_BASELINE_PCT) * 2, -VOL_TILT_MAX_PP, VOL_TILT_MAX_PP);
  const marketPct = Math.round(clampNum(base + volTilt, OCTAGON_LOW_MARKET_PCT, OCTAGON_HIGH_MARKET_PCT));
  return {
    marketPct,
    limitPct: 100 - marketPct,
    octagonScore: Math.round(clampNum(Number.isFinite(octagonScore) ? octagonScore : 50, 0, 100)),
    octagonMarketPct: Math.round(base),
    volTiltPp: Math.round(volTilt),
  };
}
