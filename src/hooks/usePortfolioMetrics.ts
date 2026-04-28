import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TOKENS, type PriceData } from '@/lib/crypto';
import { useAppSettings } from './useAppSettings';

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
  targetPct: number;        // 0..1
  holdings: number;         // coin amount
  invested: number;         // USD spent
  currentPrice: number;
  value: number;            // USD value now
  pnl: number;              // value - invested
  pnlPct: number;
  actualPct: number;        // current weight in portfolio
  deviationPct: number;     // actualPct - targetPct (in pp)
  source: 'manual' | 'dca';
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

function useDcaPurchases() {
  return useQuery({
    queryKey: ['dca_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dca_purchases')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DcaPurchaseRow[];
    },
    staleTime: 30_000,
  });
}

function useCapitalEntries() {
  return useQuery({
    queryKey: ['capital_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('capital_entries')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CapitalEntryRow[];
    },
    staleTime: 30_000,
  });
}

const TOKEN_KEY = { BTC: 'btc', ETH: 'eth', SOL: 'sol' } as const;

export function usePortfolioMetrics(prices: PriceData | undefined): PortfolioMetrics {
  const { data: purchases, isLoading: l1 } = useDcaPurchases();
  const { data: capitalEntries, isLoading: l2 } = useCapitalEntries();
  const { data: settings, isLoading: l3 } = useAppSettings();

  return useMemo<PortfolioMetrics>(() => {
    const rows = purchases ?? [];
    const manual = (settings?.manual_holdings ?? {}) as { btc?: number; eth?: number; sol?: number };

    const aggHoldings = {
      BTC: rows.reduce((s, r) => s + Number(r.btc_amount || 0), 0),
      ETH: rows.reduce((s, r) => s + Number(r.eth_amount || 0), 0),
      SOL: rows.reduce((s, r) => s + Number(r.sol_amount || 0), 0),
    };
    const aggInvested = {
      BTC: rows.reduce((s, r) => s + Number(r.btc_amount || 0) * Number(r.btc_price || 0), 0),
      ETH: rows.reduce((s, r) => s + Number(r.eth_amount || 0) * Number(r.eth_price || 0), 0),
      SOL: rows.reduce((s, r) => s + Number(r.sol_amount || 0) * Number(r.sol_price || 0), 0),
    };

    const assets: AssetMetric[] = TOKENS.map(t => {
      const sym = t.symbol as 'BTC' | 'ETH' | 'SOL';
      const manualAmt = Number(manual[TOKEN_KEY[sym]] ?? 0);
      const useManual = manualAmt > 0;
      const holdings = useManual ? manualAmt : aggHoldings[sym];
      const invested = aggInvested[sym]; // invested always comes from purchases (cost basis)
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
        actualPct: 0, // filled below
        deviationPct: 0,
        source: useManual ? 'manual' : 'dca',
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
      loading: l1 || l2 || l3,
      totalValue,
      totalInvested,
      totalPnl,
      totalPnlPct,
      assets,
      history: rows,
      capitalEntries: capitalEntries ?? [],
    };
  }, [purchases, capitalEntries, settings, prices, l1, l2, l3]);
}
