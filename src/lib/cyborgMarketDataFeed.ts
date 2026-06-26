import { cgFetch } from '@/lib/coingecko';
import { fetchLlamaPools, normalizeApyPercent } from '@/lib/defiLlamaAggregator';

export interface CyborgMarketData {
  btcPrice: number;
  ethPrice: number;
  fearGreedIndex: number;
  protocolAPY: number;
  /** Rolling 12-month ETH staking APY baseline for comparison copy. */
  protocolAPY12mAvg: number;
  lastUpdatedAt: number;
  source: 'live' | 'cache';
}

const CACHE_KEY = 'cyborg-engine-market-data-cache';
const ETH_STAKING_12M_AVG = 3.2;

export const DEFAULT_MARKET_DATA: CyborgMarketData = {
  btcPrice: 0,
  ethPrice: 0,
  fearGreedIndex: 50,
  protocolAPY: 3.1,
  protocolAPY12mAvg: ETH_STAKING_12M_AVG,
  lastUpdatedAt: 0,
  source: 'cache',
};

function safeNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function loadCachedMarketData(): CyborgMarketData {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...DEFAULT_MARKET_DATA };
    const parsed = JSON.parse(raw) as Partial<CyborgMarketData>;
    return mergeMarketData(DEFAULT_MARKET_DATA, { ...parsed, source: 'cache' });
  } catch {
    return { ...DEFAULT_MARKET_DATA };
  }
}

export function saveCachedMarketData(data: CyborgMarketData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* cache best-effort */
  }
}

export function mergeMarketData(
  base: CyborgMarketData,
  patch: Partial<CyborgMarketData>,
): CyborgMarketData {
  return {
    btcPrice: safeNum(patch.btcPrice ?? base.btcPrice),
    ethPrice: safeNum(patch.ethPrice ?? base.ethPrice),
    fearGreedIndex: safeNum(patch.fearGreedIndex ?? base.fearGreedIndex),
    protocolAPY: safeNum(patch.protocolAPY ?? base.protocolAPY),
    protocolAPY12mAvg: safeNum(patch.protocolAPY12mAvg ?? base.protocolAPY12mAvg) || ETH_STAKING_12M_AVG,
    lastUpdatedAt: safeNum(patch.lastUpdatedAt ?? base.lastUpdatedAt),
    source: patch.source ?? base.source,
  };
}

async function fetchCoinGeckoPrices(): Promise<{ btc: number; eth: number }> {
  const res = await cgFetch('/simple/price', {
    ids: 'bitcoin,ethereum',
    vs_currencies: 'usd',
  });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json() as Record<string, { usd?: number }>;
  const btc = safeNum(json.bitcoin?.usd);
  const eth = safeNum(json.ethereum?.usd);
  if (btc <= 0 || eth <= 0) throw new Error('CoinGecko empty prices');
  return { btc, eth };
}

/** Primary ETH staking APY from DeFiLlama yields index (Rocket Pool rETH). */
export function extractEthStakingApy(pools: { project: string; symbol: string; chain: string; apy: number }[]): number {
  let best: number | null = null;
  for (const pool of pools ?? []) {
    const project = String(pool.project ?? '').toLowerCase();
    const symbol = String(pool.symbol ?? '').toUpperCase();
    const chain = String(pool.chain ?? '');
    if (!project.includes('rocket') && !symbol.includes('RETH')) continue;
    if (chain !== 'Ethereum') continue;
    const apy = normalizeApyPercent(pool.apy);
    if (apy == null) continue;
    if (best === null || apy > best) best = apy;
  }
  return best ?? DEFAULT_MARKET_DATA.protocolAPY;
}

async function fetchDefiLlamaProtocolApy(): Promise<number> {
  const pools = await fetchLlamaPools();
  return extractEthStakingApy(pools);
}

/**
 * Pulls live CoinGecko prices + DeFiLlama protocol APY.
 * On any failure returns the last cached snapshot (safe fallback).
 */
export async function fetchCyborgMarketData(
  fearGreedIndex?: number,
): Promise<CyborgMarketData> {
  const cached = loadCachedMarketData();
  const fg = safeNum(fearGreedIndex ?? cached.fearGreedIndex) || 50;

  try {
    const [prices, protocolAPY] = await Promise.all([
      fetchCoinGeckoPrices(),
      fetchDefiLlamaProtocolApy(),
    ]);

    const live: CyborgMarketData = {
      btcPrice: prices.btc,
      ethPrice: prices.eth,
      fearGreedIndex: fg,
      protocolAPY,
      protocolAPY12mAvg: cached.protocolAPY12mAvg > 0 ? cached.protocolAPY12mAvg : ETH_STAKING_12M_AVG,
      lastUpdatedAt: Date.now(),
      source: 'live',
    };
    saveCachedMarketData(live);
    return live;
  } catch {
    const fallback = mergeMarketData(cached, {
      fearGreedIndex: fg,
      source: 'cache',
    });
    if (fallback.btcPrice > 0 || fallback.ethPrice > 0) {
      return fallback;
    }
    return mergeMarketData(DEFAULT_MARKET_DATA, { fearGreedIndex: fg, source: 'cache' });
  }
}
