import { TOKENS, TokenConfig, SparklineData } from './crypto';

/**
 * Dynamické limit zľavy podľa realizovanej volatility (7d sparkline).
 * Vyššia volatilita ⇒ väčšia zľava (limit ďalej od trhovej ceny).
 *
 * Garantujeme, že ETH > BTC a SOL > BTC, pretože alty sú volatilnejšie.
 */

interface VolBounds {
  /** Minimálna zľava v % (napr. 2 = 0.98) */
  minPct: number;
  /** Maximálna zľava v % */
  maxPct: number;
  /** Multiplikátor: discount = dailyVolPct * k */
  k: number;
}

const BOUNDS: Record<string, VolBounds> = {
  btc: { minPct: 2, maxPct: 5, k: 1.3 },
  eth: { minPct: 4, maxPct: 9, k: 1.5 },
  sol: { minPct: 6, maxPct: 12, k: 1.7 },
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Denná volatilita v % zo sparkline (hourly data, ~168 bodov za 7d). */
function dailyVolatilityPct(prices: number[]): number | null {
  if (!prices || prices.length < 8) return null;
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1];
    const b = prices[i];
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 4) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  const stdPerStep = Math.sqrt(variance);
  // Sparkline body sú spravidla ~hodinové → stepov za deň ≈ rets.length / 7
  const stepsPerDay = Math.max(1, rets.length / 7);
  const dailyStd = stdPerStep * Math.sqrt(stepsPerDay);
  return dailyStd * 100; // v %
}

export interface DynamicLimitInfo {
  discountPct: number;   // napr. 4.2 (%)
  discountFrac: number;  // napr. 0.958 (= 1 - 0.042)
  source: 'dynamic' | 'fallback';
}

export function computeDynamicLimit(token: TokenConfig, sparkline?: number[]): DynamicLimitInfo {
  const b = BOUNDS[token.id];
  if (!b) {
    return { discountPct: (1 - token.limitDiscount) * 100, discountFrac: token.limitDiscount, source: 'fallback' };
  }
  const vol = sparkline ? dailyVolatilityPct(sparkline) : null;
  if (vol == null) {
    const fallbackPct = clamp((1 - token.limitDiscount) * 100, b.minPct, b.maxPct);
    return { discountPct: fallbackPct, discountFrac: 1 - fallbackPct / 100, source: 'fallback' };
  }
  const pct = clamp(vol * b.k, b.minPct, b.maxPct);
  return { discountPct: pct, discountFrac: 1 - pct / 100, source: 'dynamic' };
}

// Module-level cache aktualizovaná hookom useDynamicLimits
const cache: Record<string, DynamicLimitInfo> = {};

export function setDynamicLimitsCache(map: Record<string, DynamicLimitInfo>) {
  for (const k of Object.keys(map)) cache[k] = map[k];
}

/**
 * Vráti efektívny `limitDiscount` (zlomok, napr. 0.96) pre token.
 * Ak ešte nie je v cache, použije statickú hodnotu z TOKENS.
 */
export function getEffectiveLimitDiscount(token: TokenConfig): number {
  return cache[token.id]?.discountFrac ?? token.limitDiscount;
}

export function getEffectiveLimitInfo(token: TokenConfig): DynamicLimitInfo {
  return cache[token.id] ?? {
    discountPct: (1 - token.limitDiscount) * 100,
    discountFrac: token.limitDiscount,
    source: 'fallback',
  };
}

export function computeAllDynamicLimits(sparklines?: SparklineData): Record<string, DynamicLimitInfo> {
  const out: Record<string, DynamicLimitInfo> = {};
  for (const t of TOKENS) {
    out[t.id] = computeDynamicLimit(t, sparklines?.[t.coingeckoId]);
  }
  return out;
}
