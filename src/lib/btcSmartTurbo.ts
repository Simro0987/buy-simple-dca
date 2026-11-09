/**
 * BTC · SMART TURBO (4 vrstvy) — DeFi Saver whitelist routing, Boost 1.40x
 * kalkulačka, statický Unwind rebrík a dynamický F&G + MVRV semafor.
 * Horizon DCA matematika (computeRoboAction) sa tu NEMENÍ — iba sa jej
 * odovzdá hardcap 33 % ako kapacita poolu.
 */
import type { YieldRoute } from '@/hooks/useYieldScanner';

export const BTC_POOL_PCT = 0.33;
export const BTC_COLD_PCT = 0.67;
export const BOOST_LEVERAGE = 1.4;
export const AAVE_LIQ_THRESHOLD = 0.78;
export const ANCHOR_DELTA_PCT = 2.0;
export const MACRO_ATH = 73_750;
export const WHITELIST_CHAINS = ['Arbitrum', 'Base', 'Optimism'];
const BTC_COLL = ['WBTC', 'CBBTC'];
const STABLES = ['USDT', 'USDC'];

const onWhitelist = (r: YieldRoute) => r.protocol === 'Aave V3' && WHITELIST_CHAINS.includes(r.chain);

/** Aave V3 WBTC/cbBTC collateral pools on Arbitrum/Base/Optimism, best supply first. */
export function whitelistCollateral(routes: YieldRoute[] | undefined): YieldRoute[] {
  return (routes ?? []).filter(r => onWhitelist(r) && BTC_COLL.includes(r.symbol.toUpperCase()))
    .sort((a, b) => b.supplyApy - a.supplyApy);
}

/** Cheapest USDT/USDC borrow per whitelisted chain. */
export function whitelistBorrows(routes: YieldRoute[] | undefined): YieldRoute[] {
  const best = new Map<string, YieldRoute>();
  for (const r of routes ?? []) {
    if (!onWhitelist(r) || !STABLES.includes(r.symbol.toUpperCase())) continue;
    if (typeof r.borrowApy !== 'number' || r.borrowApy <= 0 || r.borrowApy >= 100) continue;
    const cur = best.get(r.chain);
    if (!cur || r.borrowApy < cur.borrowApy!) best.set(r.chain, r);
  }
  return [...best.values()].sort((a, b) => a.borrowApy! - b.borrowApy!);
}

/**
 * Ukotvenie pozície: zostaň na aktuálnej sieti, pokiaľ iná sieť z whitelistu
 * neponúka Borrow APY nižšie o viac ako 2.0 percentuálneho bodu.
 */
export function anchoredBorrow(borrows: YieldRoute[], currentChain?: string | null) {
  const cheapest = borrows[0] ?? null;
  const current = currentChain ? borrows.find(b => b.chain === currentChain) ?? null : null;
  if (!current || !cheapest) return { route: cheapest, switchSuggested: false, current, saving: 0 };
  const saving = current.borrowApy! - cheapest.borrowApy!;
  const switchSuggested = cheapest.chain !== current.chain && saving > ANCHOR_DELTA_PCT;
  return { route: switchSuggested ? cheapest : current, switchSuggested, current, saving };
}

/** DeFi Saver Boost 1.40x on the weekly deposit + combined liquidation price. */
export function boostPlan(p: {
  depositBtc: number; price: number; existingCollBtc: number; existingDebtUsd: number;
  existingAvgPrice?: number | null; enabled: boolean;
}) {
  const lev = p.enabled ? BOOST_LEVERAGE : 1;
  const depositUsd = p.depositBtc * p.price;
  const boostedCollBtc = p.depositBtc * lev;
  const newDebtUsd = depositUsd * (lev - 1);
  const totalColl = p.existingCollBtc + boostedCollBtc;
  const totalDebt = p.existingDebtUsd + newDebtUsd;
  const liqPrice = totalColl > 0 && totalDebt > 0 ? totalDebt / (totalColl * AAVE_LIQ_THRESHOLD) : null;
  const avgBase = p.existingAvgPrice && p.existingAvgPrice > 0 ? p.existingAvgPrice : p.price;
  const avgPrice = totalColl > 0 ? (p.existingCollBtc * avgBase + boostedCollBtc * p.price) / totalColl : p.price;
  return { depositUsd, boostedCollBtc, newDebtUsd, totalColl, totalDebt, liqPrice, avgPrice, ltv: lev > 1 ? (lev - 1) / lev : 0 };
}

/** Bezpečnostná poistka Boostu. */
export function boostGate(price: number | null | undefined, sma200: number | null | undefined, rsi: number | null | undefined) {
  const belowSma = price != null && sma200 != null && price < sma200;
  return { allowed: !belowSma, belowSma, rsiGreen: rsi != null && rsi < 35 };
}

export const UNWIND_LADDER = [
  { mult: 1.3, repayPct: 33, label: 'Splatiť 33 % dlhu (Unwind)' },
  { mult: 1.5, repayPct: 33, label: 'Splatiť ďalších 33 % dlhu (Unwind)' },
  { mult: 1.8, repayPct: 100, label: 'Splatiť 100 % dlhu a vybrať čistý WBTC do Cold Storage' },
].map(s => ({ ...s, price: Math.round(MACRO_ATH * s.mult) }));

export type SemaforPhase = 0 | 1 | 2 | 3;
/** F&G + MVRV Z-Score override semafor. */
/** Thresholds 1.5 / 2.2 / 3.0 apply to MVRV Z-Score. */
export function semaforPhase(fg: number | null | undefined, mvrvZ: number | null | undefined): SemaforPhase {
  const f = fg ?? 0, m = mvrvZ ?? 0;
  if (f >= 82 || m >= 3.0) return 3;
  if (f >= 77 && m >= 2.2) return 2;
  if (f >= 70 && m >= 1.5) return 1;
  return 0;
}
