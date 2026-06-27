import { useQuery } from '@tanstack/react-query';
import { cgFetch } from '@/lib/coingecko';
import type { PriceData } from '@/lib/crypto';

export const PORTFOLIO_PRICE_IDS = ['bitcoin', 'ethereum', 'solana'] as const;
export const PORTFOLIO_PRICE_REFRESH_MS = 60_000;

type PortfolioPriceMap = Record<(typeof PORTFOLIO_PRICE_IDS)[number], number>;

async function fetchPortfolioSimplePrices(): Promise<PortfolioPriceMap> {
  const res = await cgFetch('/simple/price', {
    ids: PORTFOLIO_PRICE_IDS.join(','),
    vs_currencies: 'usd',
  });
  if (!res.ok) throw new Error('Failed to fetch portfolio prices');
  const data = await res.json() as Record<string, { usd?: number }>;
  return {
    bitcoin: Number(data.bitcoin?.usd ?? 0),
    ethereum: Number(data.ethereum?.usd ?? 0),
    solana: Number(data.solana?.usd ?? 0),
  };
}

/** Merge 60s live spot prices into the broader PriceData shape used by portfolio metrics. */
export function mergePortfolioLivePrices(
  base: PriceData | undefined,
  live: PortfolioPriceMap | undefined,
): PriceData | undefined {
  if (!live) return base;
  const next: PriceData = { ...(base ?? {}) };
  for (const id of PORTFOLIO_PRICE_IDS) {
    const usd = live[id];
    if (usd > 0) {
      next[id] = { ...next[id], usd, usd_24h_change: next[id]?.usd_24h_change };
    }
  }
  return next;
}

export function usePortfolioLivePrices() {
  return useQuery({
    queryKey: ['portfolio-live-prices'],
    queryFn: fetchPortfolioSimplePrices,
    refetchInterval: PORTFOLIO_PRICE_REFRESH_MS,
    staleTime: 30_000,
    retry: 2,
  });
}
