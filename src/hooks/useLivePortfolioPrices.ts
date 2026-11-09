/**
 * Live spot prices for the 7 active portfolio tokens.
 * Uses the never-fail cascade (Mobula → Binance → CoinGecko) from apiManager,
 * so the portfolio value/PnL never falls back to $0 when one source is down.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchTokenPrice } from '@/lib/apiManager';
import { HARVEST_TOKENS, type HarvestToken } from '@/lib/harvestEngine';
import { useHiddenTokens } from '@/lib/hiddenPortfolioTokens';
import { isTokenRemovedNow } from '@/lib/dcaTokenVisibility';
import { useLiveMarketData } from './useLiveMarketData';

export type LivePrices = Partial<Record<HarvestToken, number>>;

export function useLivePortfolioPrices() {
  const live = useLiveMarketData();
  // Odstránené tokeny sa už nikdy nedopytujú (žiadne live ceny na pozadí).
  const hiddenKey = useHiddenTokens().join(',');
  const active = HARVEST_TOKENS.filter((t) => !isTokenRemovedNow(t, t.toLowerCase()));

  const query = useQuery<LivePrices>({
    queryKey: ['live-portfolio-prices', active.join(','), hiddenKey],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        active.filter(t => !['BTC', 'ETH', 'SOL'].includes(t)).map(async (t) => [t, await fetchTokenPrice(t)] as const),
      );
      const out: LivePrices = {};
      for (const [t, p] of entries) if (Number.isFinite(p) && p > 0) out[t] = p;
      return out;
    },
  });
  return { ...query, data: {
    ...query.data,
    ...(live.data ? { BTC: live.data.btc, ETH: live.data.eth, SOL: live.data.sol } : {}),
  }, isLoading: query.isLoading || live.isPending };
}

/** Merge live prices over a base map, keeping any positive base value. */
export function mergePrices(
  base: Partial<Record<HarvestToken, number>>,
  live: LivePrices | undefined,
): Record<HarvestToken, number> {
  const out = {} as Record<HarvestToken, number>;
  for (const t of HARVEST_TOKENS) {
    const b = Number(base?.[t]) || 0;
    const current = Number(live?.[t]) || 0;
    out[t] = ['BTC', 'ETH', 'SOL'].includes(t) ? current : current > 0 ? current : b;
  }
  return out;
}
