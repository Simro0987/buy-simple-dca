import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Aave V3 Pool contracts + public RPCs for every chain the optimizer scans. */
export const AAVE_CHAINS = [
  { chain: 'Arbitrum', pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD', rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'] },
  { chain: 'Base', pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5', rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'] },
  { chain: 'Optimism', pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD', rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'] },
  { chain: 'Ethereum', pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'] },
] as const;

const BASE_KEY = 'defisaver-smart-wallet-address';
const BASE_EVENT = 'defisaver-address-change';

export const isEvmAddress = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a.trim());

export function useSmartWalletAddress(scope: 'BTC' | 'ETH' = 'BTC') {
  const KEY = scope === 'ETH' ? `${BASE_KEY}:eth` : BASE_KEY;
  const EVENT = scope === 'ETH' ? `${BASE_EVENT}:eth` : BASE_EVENT;
  const [address, setAddr] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) ?? '' : ''));
  useEffect(() => {
    const h = () => setAddr(localStorage.getItem(KEY) ?? '');
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  const setAddress = (a: string) => {
    localStorage.setItem(KEY, a.trim());
    window.dispatchEvent(new Event(EVENT));
  };
  return [address, setAddress] as const;
}

async function ethCall(rpcs: readonly string[], to: string, data: string): Promise<string> {
  let lastErr: unknown;
  for (const rpc of rpcs) {
    try {
      const r = await fetch(rpc, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      });
      const j = await r.json();
      if (j.error || typeof j.result !== 'string') throw new Error(j.error?.message ?? 'rpc');
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export interface ChainPosition { chain: string; collateralUsd: number; debtUsd: number; healthFactor: number | null }

/** getUserAccountData(address) → totalCollateralBase, totalDebtBase (USD, 8 decimals) … healthFactor (1e18). */
export function parseAccountData(hex: string) {
  const h = hex.replace('0x', '');
  const word = (i: number) => BigInt('0x' + (h.slice(i * 64, i * 64 + 64) || '0'));
  const hf = word(5);
  return {
    collateralUsd: Number(word(0)) / 1e8,
    debtUsd: Number(word(1)) / 1e8,
    healthFactor: hf > 10n ** 30n ? null : Number(hf) / 1e18,
  };
}

/** Live multi-chain Aave V3 position; BTC collateral derived from USD collateral at the live BTC price. */
export function useMultiChainPosition(address: string, btcPrice: number | undefined) {
  const valid = isEvmAddress(address);
  const q = useQuery({
    queryKey: ['aave-multichain-position', address.toLowerCase()],
    enabled: valid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const data = '0xbf92857c' + address.toLowerCase().replace('0x', '').padStart(64, '0');
      const results = await Promise.allSettled(AAVE_CHAINS.map(c => ethCall(c.rpcs, c.pool, data)));
      const positions: ChainPosition[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') positions.push({ chain: AAVE_CHAINS[i].chain, ...parseAccountData(r.value) });
        else failed.push(AAVE_CHAINS[i].chain);
      });
      if (!positions.length) throw new Error('RPC nedostupné');
      return { positions, failed, fetchedAt: Date.now() };
    },
  });
  const active = q.data?.positions.filter(p => p.collateralUsd > 0 || p.debtUsd > 0) ?? [];
  const collateralUsd = active.reduce((s, p) => s + p.collateralUsd, 0);
  const debtUsd = active.reduce((s, p) => s + p.debtUsd, 0);
  return {
    ...q,
    active,
    debtUsd: q.data ? debtUsd : undefined,
    depositedBtc: q.data && btcPrice ? collateralUsd / btcPrice : undefined,
  };
}

/** Free USD/EUR stablecoins sitting in the smart wallet (Fiat Buffer). Empty wallet → $0. */
export function useStableBuffer(address: string, eurUsd?: number) {
  const valid = isEvmAddress(address) && !!eurUsd;
  return useQuery({
    queryKey: ['stable-buffer', address.toLowerCase(), valid],
    enabled: valid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { fetchStableBalances } = await import('@/lib/multiProtocolBtc');
      return { ...(await fetchStableBalances(address.trim() as `0x${string}`, { btcUsd: 1, eurUsd: eurUsd! })), fetchedAt: Date.now() };
    },
  });
}

/** Live per-chain gas cost in USD (Ethereum + L2s), refreshed every minute. */
export function useGasMap(ethUsd?: number) {
  return useQuery({
    queryKey: ['gas-map'],
    enabled: !!ethUsd,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { fetchGasMap } = await import('@/lib/gasOracle');
      return fetchGasMap(ethUsd!);
    },
  });
}

/** Live oracle-verified BTC collateral + USD/EUR stable debt across Aave V3, Spark, Compound V3, Morpho and Maker/Sky (BTC units). */
export function useMultiProtocolBtc(address: string, btcUsd?: number, eurUsd?: number, target: 'BTC' | 'ETH' = 'BTC', ethUsd?: number) {
  const valid = isEvmAddress(address) && !!btcUsd && !!eurUsd && (target === 'BTC' || !!ethUsd);
  return useQuery({
    queryKey: ['multi-protocol', target, address.toLowerCase(), valid],
    enabled: valid,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { fetchMultiProtocolBtc } = await import('@/lib/multiProtocolBtc');
      return { ...(await fetchMultiProtocolBtc(address.trim() as `0x${string}`, { btcUsd: btcUsd!, eurUsd: eurUsd!, ethUsd }, target)), fetchedAt: Date.now() };
    },
  });
}
