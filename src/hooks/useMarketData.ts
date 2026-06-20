import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MarketDataPayload {
  generatedAt: string;
  btc: { ma200w: number; ma200wStale?: boolean; mayerMultiple: number; ma200d: number; price: number; realizedPrice: number; miningCost: number; atr14d?: number };
  // 200WMA is BTC-only — ETH/SOL never carry this field. RSI14 comes from Binance daily klines.
  eth: { atr14d?: number; rsi14?: number | null };
  sol: { tvl: number; atr14d?: number; rsi14?: number | null };
  unlocks: Array<{ symbol: string; pct: number; date: string }>;
  degraded?: boolean;
  fallback?: boolean;
  error?: string;
  debugError?: string | null;
}

const CACHE_KEY = 'dca-market-data-v2';
const FALLBACK: MarketDataPayload = {
  generatedAt: new Date(0).toISOString(),
  btc: { ma200w: 48500, ma200wStale: true, mayerMultiple: 1.15, ma200d: 0, price: 0, realizedPrice: 53600, miningCost: 50000 },
  eth: {},
  sol: { tvl: 11_500_000_000 },
  unlocks: [],
  degraded: true,
};

function readCache(): MarketDataPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) as MarketDataPayload : null;
  } catch { return null; }
}

async function fetchMarketData(): Promise<MarketDataPayload> {
  try {
    const { data, error } = await supabase.functions.invoke('market-data-service');
    if (error || !data) {
      const message = error?.message ?? 'empty market-data-service response';
      const cached = readCache();
      return { ...(cached ?? FALLBACK), fallback: true, debugError: message, error: message };
    }
    const payload = data as MarketDataPayload;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch { /* noop */ }
    return payload;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const cached = readCache();
    return { ...(cached ?? FALLBACK), fallback: true, debugError: message, error: message };
  }
}

export function useMarketData() {
  return useQuery({
    queryKey: ['dca-market-data'],
    queryFn: fetchMarketData,
    initialData: () => readCache() ?? undefined,
    refetchInterval: 30 * 60 * 1000,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}
