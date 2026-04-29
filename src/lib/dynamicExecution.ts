// Dynamic Per-Coin Execution Engine
// Calculates Market/Limit split and limit distance per coin based on:
// 1) Final Score (0-100) → base split
// 2) Per-coin 30D volatility → distance multiplier
// 3) Per-coin 30D momentum → market% adjustment

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

export function getBaseSplit(score: number): BaseSplit {
  if (score <= 25) return { marketPct: 80, limitPct: 20, distance: -2 };
  if (score <= 45) return { marketPct: 70, limitPct: 30, distance: -3 };
  if (score <= 60) return { marketPct: 60, limitPct: 40, distance: -4 };
  if (score <= 75) return { marketPct: 50, limitPct: 50, distance: -5 };
  return { marketPct: 35, limitPct: 65, distance: -6 };
}

export function getVolatilityMultiplier(vol30d: number): number {
  if (vol30d < 1.5) return 0.75;
  if (vol30d < 2.5) return 1.0;
  if (vol30d < 4.0) return 1.25;
  return 1.5;
}

export function getMomentumAdjustment(mom30d: number): number {
  if (mom30d > 15) return 10;
  if (mom30d > 5) return 5;
  if (mom30d >= -5) return 0;
  if (mom30d >= -15) return 5;
  return 10;
}

const SYMBOLS: Record<CoinKey, 'BTC' | 'ETH' | 'SOL'> = {
  btc: 'BTC', eth: 'ETH', sol: 'SOL',
};

export interface CoinMetrics {
  volatility30d: number;
  momentum30d: number;
}

export function calcCoinExecution(
  coin: CoinKey,
  score: number,
  metrics: CoinMetrics,
): CoinExecution {
  const base = getBaseSplit(score);
  const volMult = getVolatilityMultiplier(metrics.volatility30d);
  const momAdj = getMomentumAdjustment(metrics.momentum30d);

  // Distance: base × multiplier, clamp [-10, -1.5]
  const rawDist = base.distance * volMult;
  const distance = Math.max(-10, Math.min(-1.5, rawDist));

  // Market%: base + adjustment, clamp [25, 90]
  const rawMarket = base.marketPct + momAdj;
  const marketPct = Math.max(25, Math.min(90, rawMarket));
  const limitPct = 100 - marketPct;

  let rationale = '';
  if (metrics.volatility30d > 4 && Math.abs(metrics.momentum30d) > 15) {
    rationale = 'Veľmi vysoká volatilita a silné momentum.';
  } else if (metrics.volatility30d > 2.5 && metrics.momentum30d > 5) {
    rationale = 'Vyššia volatilita + uptrend. Viac market objednávok.';
  } else if (metrics.momentum30d < -10) {
    rationale = 'Pokles ceny. Širšie limity pre lepší vstup.';
  } else if (metrics.volatility30d < 1.5) {
    rationale = 'Nízka volatilita. Tesnejšie limity stačia.';
  } else {
    rationale = 'Normálne podmienky. Štandardný split.';
  }

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
