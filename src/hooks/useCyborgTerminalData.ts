import { useCallback, useEffect, useState } from 'react';
import { fetchCyborgMarketData, CyborgMarketSnapshot } from '@/lib/cyborgTerminalData';
import { computeNetYield } from '@/lib/cyborgTerminalEngine';
import { toast } from 'sonner';

export function useCyborgTerminalData(lang: 'sk' | 'en') {
  const [data, setData] = useState<CyborgMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await fetchCyborgMarketData();
      setData(snapshot);
      if (snapshot.usedFallback) {
        toast.warning(
          lang === 'sk'
            ? 'Varovanie: Používajú sa záložné dáta (API limit / chyba)'
            : 'Warning: Using Fallback Data',
        );
      }
    } catch {
      toast.error(
        lang === 'sk'
          ? 'Nepodarilo sa načítať dáta terminálu'
          : 'Failed to load terminal data',
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const netYield = data
    ? computeNetYield(data.lbtcApy, data.usdcBorrowApy)
    : 0;

  return { data, loading, refresh, netYield };
}
