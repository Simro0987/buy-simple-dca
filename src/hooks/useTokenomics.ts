import { useQuery } from '@tanstack/react-query';

export interface TokenomicsRow {
  symbol: string;
  circSupply: number | null;
  supplySource: 'coingecko' | 'mobula' | 'cache' | null;
  supplyChange7dPct: number | null;
  historyDays: number;
  unlock: { pct: number; date: string } | null;
  unlockSource: 'mobula' | null;
  errors: string[];
}

/** KROK 1 tokenomics (unlocky + 7D inflácia) z backend funkcie token-tokenomics. */
export function useTokenomics() {
  return useQuery({
    queryKey: ['token-tokenomics'],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/token-tokenomics`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '' },
      });
      if (!r.ok) throw new Error(`tokenomics ${r.status}`);
      const j = (await r.json()) as { tokens: TokenomicsRow[] };
      const out: Record<string, TokenomicsRow> = {};
      for (const t of j.tokens ?? []) out[t.symbol] = t;
      return out;
    },
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 2,
  });
}
