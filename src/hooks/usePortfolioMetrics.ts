import { useMemo } from 'react';
import { TOKENS, type PriceData } from '@/lib/crypto';
import { useProfitReservoir } from '@/lib/profitReservoir';
import { useUserHoldings } from '@/hooks/useUserHoldings';
import { normalizeUserHoldings } from '@/lib/portfolioRealHoldings';

export interface DcaPurchaseRow {
  id: string;
  created_at: string;
  week_number: number;
  total_amount: number;
  market_amount: number;
  limit_amount: number;
  btc_amount: number;
  eth_amount: number;
  sol_amount: number;
  btc_price: number;
  eth_price: number;
  sol_price: number;
}

export interface CapitalEntryRow {
  id: string;
  created_at: string;
  amount: number;
  type: string;
  note: string | null;
}

export interface AssetMetric {
  symbol: 'BTC' | 'ETH' | 'SOL';
  coingeckoId: string;
  targetPct: number;
  holdings: number;
  invested: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
  actualPct: number;
  deviationPct: number;
  source: 'user';
}

export interface PortfolioMetrics {
  loading: boolean;
  totalValue: number;
  totalInvested: number;
  totalPnl: number;
  totalPnlPct: number;
  assets: AssetMetric[];
  history: DcaPurchaseRow[];
  capitalEntries: CapitalEntryRow[];
}

export function usePortfolioMetrics(prices: PriceData | undefined): PortfolioMetrics {
  const reservoir = useProfitReservoir();
  const { holdings: userHoldings } = useUserHoldings();

  return useMemo<PortfolioMetrics>(() => {
    const safeHoldings = normalizeUserHoldings(userHoldings);
    const assets: AssetMetric[] = TOKENS.map(t => {
      const sym = t.symbol as 'BTC' | 'ETH' | 'SOL';
      const row = safeHoldings[sym];
      const sold = Number(reservoir.sells?.[sym] ?? 0);
      const holdings = Math.max(0, (row?.tokenAmount ?? 0) - sold);
      const invested = row?.investedUsd ?? 0;
      const currentPrice = prices?.[t.coingeckoId]?.usd ?? 0;
      const value = holdings * currentPrice;
      const pnl = value - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      return {
        symbol: sym,
        coingeckoId: t.coingeckoId,
        targetPct: t.allocation,
        holdings,
        invested,
        currentPrice,
        value,
        pnl,
        pnlPct,
        actualPct: 0,
        deviationPct: 0,
        source: 'user' as const,
      };
    });

    const totalValue = assets.reduce((s, a) => s + a.value, 0);
    const totalInvested = assets.reduce((s, a) => s + a.invested, 0);
    const totalPnl = totalValue - totalInvested;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    for (const a of assets) {
      a.actualPct = totalValue > 0 ? a.value / totalValue : 0;
      a.deviationPct = (a.actualPct - a.targetPct) * 100;
    }

    return {
      loading: false,
      totalValue,
      totalInvested,
      totalPnl,
      totalPnlPct,
      assets,
      history: [],
      capitalEntries: [],
    };
  }, [userHoldings, prices, reservoir.sells]);
}
