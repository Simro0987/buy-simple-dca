/**
 * Živé ceny pre aktíva mimo Harvest skórovania (wBTC, ZEC, PAXG, USDC, USDT).
 * Stablecoiny fixujeme na 1 USD, ostatné idú cez never-fail kaskádu apiManagera.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchTokenPrice } from '@/lib/apiManager';
import { EXTRA_ASSETS, STABLE_ASSETS, type ExtraAsset } from '@/lib/portfolioCategories';

export type ExtraPrices = Record<ExtraAsset, number>;

export function useExtraAssetPrices() {
  return useQuery<ExtraPrices>({
    queryKey: ['extra-asset-prices'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const out = {} as ExtraPrices;
      await Promise.all(EXTRA_ASSETS.map(async (t) => {
        if (STABLE_ASSETS.includes(t)) { out[t] = 1; return; }
        // wBTC je 1:1 zabalený BTC — cenu berieme priamo z BTC, aby nevznikol rozdiel.
        const p = await fetchTokenPrice(t === 'WBTC' ? 'BTC' : t);
        out[t] = Number.isFinite(p) && p > 0 ? p : 0;
      }));
      return out;
    },
  });
}
