import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Automatické mNAV pre MSTR (saylortracker scrape → výpočet z trhovej kapitalizácie). */
export interface MstrMnav {
  mnav: number;
  method: 'scraped' | 'calculated';
  source: string;
  estimated?: boolean;
  btcHoldings?: number;
  at: string;
}

export function useMstrMnav() {
  return useQuery({
    queryKey: ['mstr-mnav'],
    queryFn: async (): Promise<MstrMnav> => {
      const { data, error } = await supabase.functions.invoke('mstr-mnav');
      if (error || !data || !(Number(data.mnav) > 0)) throw new Error(error?.message ?? 'mNAV nedostupné');
      return data as MstrMnav;
    },
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });
}

/** „Fundamentálne čistý štít“ — automaticky vždy splnený. */
export const MSTR_CLEAN_SHEET = true;

/** Exekučná matica podľa mNAV: < 1,0 → 150 %, 1,0–1,3 → 100 %, > 1,3–1,6 → 50 %, inak 0 %. */
export function mnavMultiplier(mnav: number): number {
  if (mnav < 1.0) return 1.5;
  if (mnav <= 1.3) return 1.0;
  if (mnav <= 1.6) return 0.5;
  return 0;
}

// ── Globálny bonus_pool — výsledok Brake & Boost zdieľaný s MSTR kartou ──
export interface ProxyPoolFlow { toPoolUsd: number; fromPoolUsd: number; fromReserveUsd: number }
let poolFlow: ProxyPoolFlow = { toPoolUsd: 0, fromPoolUsd: 0, fromReserveUsd: 0 };
const EVT = 'proxy-pool-flow';
export function publishProxyPoolFlow(f: ProxyPoolFlow) {
  if (f.toPoolUsd === poolFlow.toPoolUsd && f.fromPoolUsd === poolFlow.fromPoolUsd && f.fromReserveUsd === poolFlow.fromReserveUsd) return;
  poolFlow = f;
  window.dispatchEvent(new Event(EVT));
}
export function useProxyPoolFlow(): ProxyPoolFlow {
  const [v, setV] = useState(poolFlow);
  useEffect(() => {
    const h = () => setV(poolFlow);
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return v;
}
