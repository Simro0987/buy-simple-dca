// Dynamic Per-Coin Execution Engine
// Calculates Market/Limit split and limit distance per coin based on:
// 1) Final Score (0-100) → base split
// 2) Per-coin 14D volatility → distance multiplier
// 3) Per-coin 14D momentum → market% adjustment

export type CoinKey = 'btc' | 'eth' | 'sol';

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
}

export interface BaseSplit {
  marketPct: number;
  limitPct: number;
  distance: number; // negative
}

/**
 * Kontinuálny base split — žiadne skokové pásma.
 * Score 0  → market 85 %, distance -1.5 %
 * Score 50 → market 60 %, distance -4.0 %
 * Score 100 → market 30 %, distance -6.5 %
 * (lineárna interpolácia medzi krajnými bodmi)
 */
export function getBaseSplit(score: number): BaseSplit {
  const s = Math.max(0, Math.min(100, score));
  const t = s / 100; // 0..1
  const marketPct = 85 - 55 * t;        // 85 → 30
  const distance = -1.5 - 5.0 * t;       // -1.5 → -6.5
  return {
    marketPct: Math.round(marketPct * 10) / 10,
    limitPct: Math.round((100 - marketPct) * 10) / 10,
    distance: Math.round(distance * 10) / 10,
  };
}

/**
 * Kontinuálny multiplier (nie skokový) — aj malý rozdiel vol medzi BTC/ETH/SOL
 * generuje viditeľne odlišný limit distance.
 * Mapovanie: vol 0% → 0.5×, vol 2% → 1.0×, vol 4% → 1.5×, vol 6%+ → 2.0× (cap).
 */
export function getVolatilityMultiplier(vol30d: number): number {
  const mult = 0.5 + vol30d * 0.25;
  return Math.max(0.5, Math.min(2.0, mult));
}

/**
 * Kontinuálny momentum adjustment na Market% (žiadne skokové +5/+10).
 * mom -20 % → +12 (viac market, kupuj pád)
 * mom   0 % → 0
 * mom +20 % → +12 (viac market, chyť trend)
 * Lineárna |mom| × 0.6, cap ±15.
 * Znamienko: pri downtrende aj uptrende zvyšujeme market % (rýchlejší vstup),
 * pri neutráli nechávame base split.
 */
export function getMomentumAdjustment(mom30d: number): number {
  const adj = Math.abs(mom30d) * 0.6;
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
  const rawMarket = base.marketPct + momAdj;
  const marketPct = Math.round(Math.max(25, Math.min(90, rawMarket)) * 10) / 10;
  const limitPct = Math.round((100 - marketPct) * 10) / 10;

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
