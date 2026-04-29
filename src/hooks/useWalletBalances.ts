import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WalletEntry, ChainId } from '@/lib/wallets';

export interface OnChainToken {
  symbol: string;
  coingeckoId: string | null;
  balance: number;
  contract?: string;
  mint?: string;
  decimals?: number;
  known?: boolean;
}

export interface OnChainWalletResult {
  ok: boolean;
  address: string;
  chain: ChainId;
  error?: string;
  // BTC
  balanceBtc?: number;
  balanceSats?: number;
  txCount?: number;
  // ETH/SOL/ARB
  native?: { symbol: string; balance: number; coingeckoId: string };
  tokens?: OnChainToken[];
}

async function fetchChain(fn: string, addresses: string[]): Promise<OnChainWalletResult[]> {
  if (addresses.length === 0) return [];
  const { data, error } = await supabase.functions.invoke(fn, { body: { addresses } });
  if (error) throw error;
  return (data?.data ?? []) as OnChainWalletResult[];
}

export function useWalletBalances(wallets: WalletEntry[]) {
  const btcAddrs = wallets.filter(w => w.chain === 'btc').map(w => w.address);
  const ethAddrs = wallets.filter(w => w.chain === 'eth').map(w => w.address);
  const solAddrs = wallets.filter(w => w.chain === 'sol').map(w => w.address);
  const arbAddrs = wallets.filter(w => w.chain === 'arb').map(w => w.address);

  return useQuery({
    queryKey: ['wallet-balances', btcAddrs, ethAddrs, solAddrs, arbAddrs],
    queryFn: async () => {
      const [btc, eth, sol, arb] = await Promise.all([
        fetchChain('wallet-balance-btc', btcAddrs),
        fetchChain('wallet-balance-eth', ethAddrs),
        fetchChain('wallet-balance-sol', solAddrs),
        fetchChain('wallet-balance-arb', arbAddrs),
      ]);
      return { btc, eth, sol, arb };
    },
    enabled: wallets.length > 0,
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 2,
  });
}
