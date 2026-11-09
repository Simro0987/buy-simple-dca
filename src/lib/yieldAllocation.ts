// Yield Token Selection & Allocation Engine
// ─────────────────────────────────────────────────────────────
// KROK 1 — Inteligentný výberový filter (Entry Signal):
//   Token je zahrnutý len ak splní VŠETKY 3 podmienky (3/3):
//     A) RSI(14D) < 50          → nie je prekúpený
//     B) priceVsSMA14 ≥ −10 %   → cena nad / v zdravej korekcii pri MA
//     C) fundamentalYield ≥ 50  → protokol generuje reálne poplatky
//
// KROK 2 — High-Conviction alokácia (Winner-Takes-Most):
//   • Skóre kombinuje technickú silu (RSI/momentum/vol) + fundament.
//   • Váha = (skóre ^ POWER) / Σ(skóre ^ POWER), s POWER = 2.5 → kapitál sa
//     prirodzene preleje do najsilnejších signálov.
//   • Ak neprejde žiadny token filtrom 3/3, celý kapitál sa vracia do
//     CORE/SATELLITE cez `reflowUsd` (žiadne nútené alokácie).
//
// KROK 3 — Homogénna exekúcia:
//   • Yield tokeny používajú rovnaký split MKT/LMT ako CORE/SATELLITE.
//   • Limit distance sa škáluje volatilitou.


import { YIELD_TOKENS, type YieldToken, type YieldNetwork } from './yieldTokens';
import type { YieldMetric, YieldMetricsMap } from '@/hooks/useYieldTokenMetrics';

export type YieldFilterCheckId = 'rsi' | 'momentum' | 'fundamental';

export interface YieldFilterCheck {
  id: YieldFilterCheckId;
  label: string;
  passed: boolean;
  value: string;
  threshold: string;
}

/** Exponenciálne váženie skóre — vyššia hodnota = tvrdšie "winner-takes-most". */
export const CONVICTION_POWER = 2.5;


export function scoreYieldToken(m: YieldMetric, t?: YieldToken): number {
  const rsiScore = 100 - Math.max(0, Math.min(100, m.rsi14));      // low RSI -> high
  const momScore = Math.max(0, Math.min(100, 50 - m.momentum14d)); // negative mom -> high
  const volPenalty = Math.max(-25, Math.min(25, (5 - m.volatility14d) * 3));
  const volScore = 50 + volPenalty;
  const technical = 0.5 * rsiScore + 0.35 * momScore + 0.15 * volScore;
  // Fundament (protokolové poplatky) je stály násobič v kombinovanom skóre.
  const fundamental = t ? Math.max(0, Math.min(100, t.fundamentalYield)) : 60;
  const blend = 0.7 * technical + 0.3 * fundamental;
  return Math.max(0, Math.min(100, blend));
}

export function runEntryFilter(t: YieldToken, m: YieldMetric): YieldFilterCheck[] {
  return [
    {
      id: 'rsi',
      label: 'RSI < 50',
      passed: m.rsi14 < 50,
      value: `RSI ${m.rsi14.toFixed(0)}`,
      threshold: '< 50 (nie prekúpené)',
    },
    {
      id: 'momentum',
      label: 'Cena nad MA / zdravá korekcia',
      passed: m.priceVsSmaPct >= -10,
      value: `${m.priceVsSmaPct >= 0 ? '+' : ''}${m.priceVsSmaPct.toFixed(1)}% vs SMA14`,
      threshold: '≥ −10 % vs SMA14',
    },
    {
      id: 'fundamental',
      label: 'Fundamentálny yield',
      passed: t.fundamentalYield >= 50,
      value: `F${t.fundamentalYield} · ${t.fundamentalNote}`,
      threshold: '≥ 50 / 100',
    },
  ];
}

export interface YieldAllocation {
  id: string;
  symbol: string;
  coingeckoId: string;
  network: YieldNetwork;
  score: number;      // 0..100 (kombinované skóre — technika + fundament)
  weight: number;     // 0..1 v rámci yield koša (po high-conviction váhovaní)
  usd: number;
  eligible: boolean;  // prešiel filtrom (≥ 2/3)
  /** Prešiel filtrom AND dostal významnú alokáciu ≥ MIN_POSITION_USD. */
  active: boolean;
  price: number;
  volatility14d: number;
  momentum14d: number;
  rsi14: number;
  priceVsSmaPct: number;
  fundamentalYield: number;
  fundamentalNote: string;
  checks: YieldFilterCheck[];
  hitCount: number;
  entryReason: string;
  rejectReason: string;
}

/** Vylučovací filter bol odstránený — všetky yield tokeny zostávajú trvalo v poole. */
const REQUIRED_HITS = 0;

export function computeYieldAllocations(
  bucketUsd: number,
  metrics: YieldMetricsMap | undefined,
): YieldAllocation[] {
  const rows = YIELD_TOKENS.map(t => {
    const m: YieldMetric = metrics?.[t.id] ?? {
      price: 0, volatility14d: 4, momentum14d: 0, rsi14: 50, sma14: 0, priceVsSmaPct: 0,
    };
    const checks = runEntryFilter(t, m);
    const hitCount = checks.filter(c => c.passed).length;
    const eligible = hitCount >= REQUIRED_HITS;
    return { t, m, checks, hitCount, eligible, score: scoreYieldToken(m, t) };
  });

  // High-Conviction pipeline: exponenciálne váhy pre tokeny, ktoré prešli 3/3 filtrom.
  const weights = new Map<string, number>();
  const usds = new Map<string, number>();
  const active = new Set(rows.filter(r => r.eligible && r.score > 0).map(r => r.t.id));

  if (active.size > 0 && bucketUsd > 0) {
    const total = [...active].reduce((s, id) => {
      const r = rows.find(x => x.t.id === id)!;
      return s + Math.pow(r.score, CONVICTION_POWER);
    }, 0);
    if (total > 0) {
      for (const id of active) {
        const r = rows.find(x => x.t.id === id)!;
        const w = Math.pow(r.score, CONVICTION_POWER) / total;
        weights.set(id, w);
        usds.set(id, bucketUsd * w);
      }
    } else {
      active.clear();
    }
  }


  return rows.map(({ t, m, checks, hitCount, eligible, score }) => {
    const weight = weights.get(t.id) ?? 0;
    const usd = usds.get(t.id) ?? 0;
    const isActive = active.has(t.id);

    const passed = checks.filter(c => c.passed);
    const entryReason = passed.length > 0
      ? passed.map(c => {
          if (c.id === 'rsi') return `RSI Oversold (${m.rsi14.toFixed(0)})`;
          if (c.id === 'momentum') return `Momentum OK (${m.priceVsSmaPct >= 0 ? '+' : ''}${m.priceVsSmaPct.toFixed(1)}% MA)`;
          return `Fundamentals (F${t.fundamentalYield})`;
        }).join(' · ')
      : `Neutrálne signály — dynamická váha (skóre ${score.toFixed(0)})`;

    // Bez vylučovacieho filtra — dôvod na odmietnutie neexistuje.
    const rejectReason = '';



    return {
      id: t.id,
      symbol: t.symbol,
      coingeckoId: t.coingeckoId,
      network: t.network,
      score,
      weight,
      usd,
      eligible,
      active: isActive,
      price: m.price,
      volatility14d: m.volatility14d,
      momentum14d: m.momentum14d,
      rsi14: m.rsi14,
      priceVsSmaPct: m.priceVsSmaPct,
      fundamentalYield: t.fundamentalYield,
      fundamentalNote: t.fundamentalNote,
      checks,
      hitCount,
      entryReason,
      rejectReason,
    };
  });
}

/** Nevyužitý yield kapitál (kôš − suma aktívnych pozícií) — reflow do CORE/SAT. */
export function computeYieldReflowUsd(bucketUsd: number, rows: YieldAllocation[]): number {
  const used = rows.filter(r => r.active).reduce((s, r) => s + r.usd, 0);
  return Math.max(0, bucketUsd - used);
}

/**
 * Kontinuálna Market/Limit "prevodovka" pre Yield tokeny (Yield Sniper).
 *
 * 1) Market % je plynulá funkcia RSI(14D) — čím nižšie RSI (väčšia zľava),
 *    tým agresívnejší Market nákup:
 *      base_market = 80 − ((RSI − 30) × 2.5),  clamp [20, 80]
 *    Príklady: RSI 30 → 80 %, RSI 45 → 42.5 %, RSI 50 → 30 %.
 *
 * 2) Limitná cena pre zvyšný kapitál je nastavená 2.0× denného ATR pod spot
 *    (altcoiny sú volatilnejšie ako Satelity → hlbšia sieť pre flash crashe).
 *    ATR% aproximujeme cez 14D dennú volatilitu (stdev denných výnosov).
 */
export function yieldContinuousMarketPct(rsi14: number): number {
  const raw = 80 - (rsi14 - 30) * 2.5;
  return Math.max(20, Math.min(80, raw));
}

export function yieldAtrLimitDiscountPct(volatility14dPct: number): number {
  // ATR% ≈ denná volatilita; použijeme 2.0× ako limit distance
  const dailyAtrPct = Math.max(0, volatility14dPct);
  return -2.0 * dailyAtrPct;
}

/** Min order threshold in USD — below this, exchange rejects the order. */
export const MIN_ORDER_USD = 10;
/** RSI threshold for yield merge routing: < 38 → Market, ≥ 38 → Limit. */
export const YIELD_MERGE_RSI_THRESHOLD = 38;

export interface YieldExecution {
  marketPct: number;
  limitPct: number;
  limitDistancePct: number;
  limitPrice: number;
  marketUsd: number;
  limitUsd: number;
  merged: boolean;
  mergedInto: 'market' | 'limit' | null;
  mergeReason: string | null;
}

/** $10 Rule (Merge Protocol) platí LEN pre HYPE; ostatné yield tokeny vždy delia split. */
export const YIELD_MERGE_TOKENS = ['HYPE'] as const;
/** RSI hranica pre Safety Brake — extrémne prehriaty yield token. */
export const YIELD_SAFETY_BRAKE_RSI = 75;

export interface YieldExecutionExtras {
  safetyBrake?: boolean;
  safetyBrakeReason?: string;
}

export function computeYieldExecution(
  a: YieldAllocation,
  _finalScore: number,
): YieldExecution & YieldExecutionExtras {
  // Starý 10/90 Safety Brake bol odstránený — prehriatie riadi výhradne
  // Safety Active Brake & Boost engine (multiplier iba na MKT sumu).



  let marketPct = Math.round(yieldContinuousMarketPct(a.rsi14));
  let limitPct = 100 - marketPct;
  const limitDistancePct = Math.round(yieldAtrLimitDiscountPct(a.volatility14d) * 10) / 10;
  const limitPrice = a.price > 0 ? a.price * (1 + limitDistancePct / 100) : 0;
  let marketUsd = (a.usd * marketPct) / 100;
  let limitUsd = (a.usd * limitPct) / 100;

  // Merge protocol ($10 Rule) — UNIVERZÁLNY pre všetky yield tokeny:
  // chráni pred zamietnutím príkazu, keď je noha (alebo celá alokácia) < $10.
  let merged = false;
  let mergedInto: 'market' | 'limit' | null = null;
  let mergeReason: string | null = null;
  const mergeEligible = (YIELD_MERGE_TOKENS as readonly string[]).includes(String(a.symbol ?? '').toUpperCase());
  const legTooSmall = (limitUsd > 0 && limitUsd < MIN_ORDER_USD) || (marketUsd > 0 && marketUsd < MIN_ORDER_USD);
  if (mergeEligible && a.usd > 0 && legTooSmall) {
    const total = marketUsd + limitUsd;
    merged = true;
    if (total < MIN_ORDER_USD) {
      // Mikro-nákup: 100 % Market, aby sa exekúcia vôbec zrealizovala.
      mergedInto = 'market';
      mergeReason = `Total $${total.toFixed(2)} < $${MIN_ORDER_USD} → 100 % Market (mikro-nákup)`;
      marketUsd = total; limitUsd = 0; marketPct = 100; limitPct = 0;
    } else if (a.rsi14 < YIELD_MERGE_RSI_THRESHOLD) {
      mergedInto = 'market';
      mergeReason = `RSI ${a.rsi14.toFixed(0)} < ${YIELD_MERGE_RSI_THRESHOLD} → 100 % Market (oversold, kúp hneď)`;
      marketUsd = total; limitUsd = 0; marketPct = 100; limitPct = 0;
    } else {
      mergedInto = 'limit';
      mergeReason = `RSI ${a.rsi14.toFixed(0)} ≥ ${YIELD_MERGE_RSI_THRESHOLD} → 100 % Limit (2.0× ATR pod spot)`;
      limitUsd = total; marketUsd = 0; marketPct = 0; limitPct = 100;
    }
  }

  return {
    marketPct, limitPct, limitDistancePct, limitPrice,
    marketUsd, limitUsd,
    merged, mergedInto, mergeReason,
  };
}

export type { YieldToken };
