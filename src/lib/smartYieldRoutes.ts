/**
 * Layer 2 route comparison — filters the LIVE DefiLlama scan (Aave V3 + Morpho)
 * down to the supported L2s and ranks candidates by real supply APY.
 */
import type { YieldRoute } from '@/hooks/useYieldScanner';

export const SUPPORTED_CHAINS = ['Arbitrum', 'Base', 'Optimism', 'Ethereum', 'Gnosis']
export const SUPPORTED_PROTOCOLS = ['Aave V3', 'Morpho', 'Spark', 'Compound V3', 'Maker / Sky'];;
export const STABLE_BORROW_SYMBOLS = ['USDC', 'USDT', 'USDS', 'DAI', 'USDC.E', 'EURC', 'EURS', 'EURE', 'AGEUR', 'EURA'];
export const EUR_STABLES = ['EURC', 'EURS', 'EURE', 'AGEUR', 'EURA'];
export const isEurStable = (s?: string) => !!s && EUR_STABLES.includes(s.toUpperCase());

const BTC_SYMBOLS = ['CBBTC', 'WBTC', 'TBTC', 'LBTC'];
const ETH_SYMBOLS = ['WSTETH', 'WETH', 'ETH'];

export function candidateRoutes(routes: YieldRoute[] | undefined, asset: 'BTC' | 'ETH'): YieldRoute[] {
  if (!routes?.length) return [];
  const symbols = asset === 'BTC' ? BTC_SYMBOLS : ETH_SYMBOLS;
  const candidates = routes
    .filter(r => SUPPORTED_CHAINS.includes(r.chain))
    .filter(r => SUPPORTED_PROTOCOLS.includes(r.protocol))
    .filter(r => Number.isFinite(r.supplyApy) && r.supplyApy >= 0 && r.supplyApy <= 100)
    .filter(r => symbols.includes(r.symbol.toUpperCase()))
    .sort((a, b) => b.supplyApy - a.supplyApy || b.tvlUsd - a.tvlUsd);
  // One best route per protocol / chain: duplicate vaults cannot hide a competitor.
  const seen = new Set<string>();
  return candidates.filter(r => {
    const key = `${r.protocol}:${r.chain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function winningRoute(routes: YieldRoute[] | undefined, asset: 'BTC' | 'ETH'): YieldRoute | null {
  return candidateRoutes(routes, asset)[0] ?? null;
}

export function bestStableSupply(routes: YieldRoute[] | undefined): YieldRoute | null {
  if (!routes?.length) return null;
  const stables = routes
    .filter(r => SUPPORTED_CHAINS.includes(r.chain))
    .filter(r => r.symbol.toUpperCase() === 'USDC')
    .sort((a, b) => b.supplyApy - a.supplyApy);
  return stables[0] ?? null;
}

/** Cheapest stablecoin borrow on the same protocol + chain as the collateral route (falls back to any supported chain). */
export function cheapestStableBorrow(routes: YieldRoute[] | undefined, collateral?: YieldRoute | null): YieldRoute | null {
  if (!routes?.length) return null;
  const all = routes
    .filter(r => SUPPORTED_CHAINS.includes(r.chain) && SUPPORTED_PROTOCOLS.includes(r.protocol))
    .filter(r => STABLE_BORROW_SYMBOLS.includes(r.symbol.toUpperCase()))
    .filter(r => typeof r.borrowApy === 'number' && r.borrowApy! > 0 && r.borrowApy! < 100)
    .sort((a, b) => a.borrowApy! - b.borrowApy!);
  const same = collateral ? all.filter(r => r.chain === collateral.chain && r.protocol === collateral.protocol) : [];
  return same[0] ?? all[0] ?? null;
}

/**
 * Same-position rule: collateral and stable borrow MUST share the exact protocol + chain.
 * Scores every candidate pair by net carry (supply APY − borrow APY × target LTV).
 */
export function bestCombinedRoute(routes: YieldRoute[] | undefined, asset: 'BTC' | 'ETH', targetLtv: number) {
  let best: { collateral: YieldRoute; borrow: YieldRoute; netApy: number } | null = null;
  for (const c of candidateRoutes(routes, asset)) {
    const b = cheapestStableBorrow(routes, c);
    if (!b || b.chain !== c.chain || b.protocol !== c.protocol) continue;
    const netApy = c.supplyApy - (b.borrowApy ?? 0) * targetLtv;
    if (!best || netApy > best.netApy) best = { collateral: c, borrow: b, netApy };
  }
  return best;
}

export interface NetRoute {
  collateral: YieldRoute; borrow: YieldRoute; netApy: number;
  /** Expected 1-year yield minus gas, in USD. */
  netUsd: number; gasUsd: number; yieldUsd: number;
}

/**
 * Gas-aware winning route: ranks same-chain pairs by ESTIMATED NET USD PROFIT
 * (1-year yield on the position value minus the chain's live gas cost),
 * not raw APY. Falls back to pure net-APY ranking when no gas data exists.
 */
export function bestNetRoute(
  routes: YieldRoute[] | undefined,
  asset: 'BTC' | 'ETH',
  targetLtv: number,
  valueUsd: number,
  gasMap?: Record<string, number>,
): NetRoute | null {
  let best: NetRoute | null = null;
  for (const c of candidateRoutes(routes, asset)) {
    const b = cheapestStableBorrow(routes, c);
    if (!b || b.chain !== c.chain || b.protocol !== c.protocol) continue;
    const netApy = c.supplyApy - (b.borrowApy ?? 0) * targetLtv;
    const gasUsd = gasMap?.[c.chain] ?? 0;
    const yieldUsd = valueUsd * (netApy / 100);
    const netUsd = gasMap ? yieldUsd - gasUsd : netApy; // no gas data → legacy APY ranking
    if (!best || netUsd > best.netUsd) best = { collateral: c, borrow: b, netApy, netUsd, gasUsd, yieldUsd };
  }
  return best;
}

/**
 * Smart debt refinancing: compares the user's current weighted borrow cost
 * against the cheapest live borrow route. Returns the yearly USD saving net
 * of the refinancing gas cost, or null when refinancing doesn't pay off.
 */
export function refinancingSaving(
  currentDebtUsd: number,
  currentAvgBorrowApy: number,
  best: YieldRoute | null,
  gasMap?: Record<string, number>,
): { savingUsd: number; gasUsd: number; route: YieldRoute } | null {
  if (!best || currentDebtUsd <= 0 || best.borrowApy == null) return null;
  const gasUsd = gasMap?.[best.chain] ?? 0;
  const gross = currentDebtUsd * ((currentAvgBorrowApy - best.borrowApy) / 100);
  const savingUsd = gross - gasUsd;
  return savingUsd > 0 ? { savingUsd, gasUsd, route: best } : null;
}
