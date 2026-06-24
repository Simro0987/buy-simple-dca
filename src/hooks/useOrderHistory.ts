import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getDcaPurchases } from '@/lib/profitTaking';

export interface OrderHistoryEntry {
  id: string;
  orderType: 'market' | 'limit';
  token: string;
  amount: number;
  price: number;
  timestamp: string;
  amountUsd: number;
  source: 'supabase' | 'local';
}

const TOKEN_LABEL: Record<string, string> = {
  btc: 'BTC',
  eth: 'ETH',
  sol: 'SOL',
};

function normalizeToken(coin: string): string {
  return TOKEN_LABEL[coin.toLowerCase()] ?? coin.toUpperCase();
}

function mapExecution(row: {
  id: string;
  kind: string;
  coin: string;
  quantity: number | null;
  executed_price: number | null;
  target_price: number | null;
  filled_at: string | null;
  created_at: string;
  amount_usd: number;
}): OrderHistoryEntry {
  const orderType = row.kind === 'limit' ? 'limit' : 'market';
  return {
    id: row.id,
    orderType,
    token: normalizeToken(row.coin),
    amount: Number(row.quantity) || 0,
    price: Number(row.executed_price ?? row.target_price) || 0,
    timestamp: row.filled_at ?? row.created_at,
    amountUsd: Number(row.amount_usd) || 0,
    source: 'supabase',
  };
}

function mapLocalPurchase(
  purchase: ReturnType<typeof getDcaPurchases>[number],
  index: number,
): OrderHistoryEntry {
  return {
    id: `local-${index}-${purchase.date}`,
    orderType: purchase.type,
    token: TOKEN_LABEL[purchase.tokenId] ?? purchase.tokenId.toUpperCase(),
    amount: purchase.quantity,
    price: purchase.priceUsd,
    timestamp: purchase.date,
    amountUsd: purchase.totalUsd,
    source: 'local',
  };
}

async function fetchExecutedOrders(): Promise<OrderHistoryEntry[]> {
  const { data, error } = await supabase
    .from('dca_executions')
    .select('*')
    .in('status', ['EXECUTED', 'FILLED'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []).map(mapExecution);
}

export function useOrderHistory() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order-history'],
    queryFn: fetchExecutedOrders,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const orders = useMemo(() => {
    const remote = data ?? [];
    if (remote.length > 0) return remote;
    return getDcaPurchases()
      .map(mapLocalPurchase)
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  }, [data]);

  return {
    orders,
    isLoading,
    isError,
    usingLocalFallback: (data?.length ?? 0) === 0 && orders.length > 0,
  };
}
