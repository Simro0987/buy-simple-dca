import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TxSide = 'buy' | 'sell';

export interface TokenTransaction {
  id: string;
  coingecko_id: string;
  symbol: string;
  side: TxSide;
  quantity: number;
  price_usd: number;
  executed_at: string;
  note: string | null;
  created_at: string;
}

export interface TokenPosition {
  quantity: number;   // net after buys − sells
  costBasis: number;  // net USD invested (buys − sells at avg cost)
  avgCost: number;    // costBasis / quantity, 0 if none
}

export function useTokenTransactions() {
  return useQuery({
    queryKey: ['token_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_transactions')
        .select('*')
        .order('executed_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TokenTransaction[];
    },
    staleTime: 30_000,
  });
}

export function aggregatePositions(txs: TokenTransaction[]): Record<string, TokenPosition> {
  const map: Record<string, TokenPosition> = {};
  for (const tx of txs) {
    const cur = map[tx.coingecko_id] ?? { quantity: 0, costBasis: 0, avgCost: 0 };
    const qty = Number(tx.quantity);
    const price = Number(tx.price_usd);
    if (tx.side === 'buy') {
      cur.quantity += qty;
      cur.costBasis += qty * price;
    } else {
      // sell — reduce quantity, reduce cost basis at current avg
      const avg = cur.quantity > 0 ? cur.costBasis / cur.quantity : 0;
      const sellQty = Math.min(qty, cur.quantity);
      cur.quantity -= sellQty;
      cur.costBasis = Math.max(0, cur.costBasis - avg * sellQty);
    }
    cur.avgCost = cur.quantity > 0 ? cur.costBasis / cur.quantity : 0;
    map[tx.coingecko_id] = cur;
  }
  return map;
}

export function useAddTokenTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      coingecko_id: string;
      symbol: string;
      side: TxSide;
      quantity: number;
      price_usd: number;
      executed_at?: string;
      note?: string;
    }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error('Nie si prihlásený');
      const { data, error } = await supabase
        .from('token_transactions')
        .insert({
          user_id: uid,
          coingecko_id: input.coingecko_id,
          symbol: input.symbol.toUpperCase(),
          side: input.side,
          quantity: input.quantity,
          price_usd: input.price_usd,
          executed_at: input.executed_at ?? new Date().toISOString(),
          note: input.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['token_transactions'] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
      qc.invalidateQueries({ queryKey: ['tracked_tokens'] });
      qc.invalidateQueries({ queryKey: ['portfolio-extra-prices'] });
      qc.invalidateQueries({ queryKey: ['globalBalances'] });
      qc.invalidateQueries({ queryKey: ['avgBuyPrices'] });
    },
  });
}

export function useDeleteTokenTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('token_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['token_transactions'] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
      qc.invalidateQueries({ queryKey: ['globalBalances'] });
      qc.invalidateQueries({ queryKey: ['avgBuyPrices'] });
    },
  });
}
