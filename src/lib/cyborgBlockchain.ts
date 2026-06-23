import { Connection, PublicKey } from '@solana/web3.js';
import { fetchWithCache } from '@/lib/apiCache';

export const API_OFFLINE = 'Error: API Offline';

/** Rocket Pool rETH (Ethereum mainnet) — user-specified contract */
export const RETH_CONTRACT = '0xec70dcb4a1efa46b8f2d07c312c7c413cde5d249';
/** ether.fi weETH on Arbitrum */
export const WEETH_ARB_CONTRACT = '0x35751007a407ca6bE044F9e0e0714eC39a204839';
/** Lombard LBTC on Arbitrum */
export const LBTC_ARB_CONTRACT = '0x93919784C523F39CACaa98EeC0A3E7aeeC4470c5';

export const MSOL_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
/** Sanctum INF */
export const INF_MINT = '5oVNBeEEQvYi1cX3ir8Dx7n1P7pdtx9NiJvWMSGznE8';

export interface TokenBalanceResult {
  qty: number;
  error?: string;
}

export interface CyborgOnChainBalances {
  rEth: TokenBalanceResult;
  weEth: TokenBalanceResult;
  lbtc: TokenBalanceResult;
  mSol: TokenBalanceResult;
  inf: TokenBalanceResult;
  fetchedAt: Date;
  hasErrors: boolean;
}

function alchemyUrl(chain: 'eth' | 'arb'): string | null {
  const key = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined;
  if (!key?.trim()) return null;
  return chain === 'eth'
    ? `https://eth-mainnet.g.alchemy.com/v2/${key.trim()}`
    : `https://arb-mainnet.g.alchemy.com/v2/${key.trim()}`;
}

function publicRpc(chain: 'eth' | 'arb'): string {
  return chain === 'eth' ? 'https://eth.llamarpc.com' : 'https://arb1.arbitrum.io/rpc';
}

function encodeBalanceOf(owner: string): string {
  const addr = owner.toLowerCase().replace('0x', '');
  return `0x70a08231${addr.padStart(64, '0')}`;
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'eth_call failed');
  return json.result as string;
}

async function fetchErc20Balance(
  owner: string,
  contract: string,
  decimals: number,
  chain: 'eth' | 'arb',
): Promise<TokenBalanceResult> {
  const urls = [alchemyUrl(chain), publicRpc(chain)].filter(Boolean) as string[];
  const data = encodeBalanceOf(owner);
  let lastErr: unknown;

  for (const url of urls) {
    try {
      const hex = await ethCall(url, contract, data);
      if (!hex || hex === '0x') return { qty: 0 };
      const raw = BigInt(hex);
      return { qty: Number(raw) / 10 ** decimals };
    } catch (e) {
      lastErr = e;
    }
  }

  return { qty: 0, error: API_OFFLINE };
}

async function fetchSolanaMintBalance(owner: string, mint: string): Promise<TokenBalanceResult> {
  try {
    const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const accounts = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), {
      mint: new PublicKey(mint),
    });
    let total = 0;
    for (const { account } of accounts.value) {
      const info = account.data.parsed?.info;
      const amount = info?.tokenAmount?.uiAmount;
      if (typeof amount === 'number') total += amount;
    }
    return { qty: total };
  } catch {
    return { qty: 0, error: API_OFFLINE };
  }
}

export async function fetchCyborgOnChainBalances(
  evmAddress: string,
  solanaAddress: string,
  opts?: { force?: boolean },
): Promise<CyborgOnChainBalances> {
  const cacheKey = `cyborg-balances:${evmAddress}:${solanaAddress}`;

  const { data } = await fetchWithCache(
    cacheKey,
    async () => {
      const [rEth, weEth, lbtc, mSol, inf] = await Promise.all([
        fetchErc20Balance(evmAddress, RETH_CONTRACT, 18, 'eth'),
        fetchErc20Balance(evmAddress, WEETH_ARB_CONTRACT, 18, 'arb'),
        fetchErc20Balance(evmAddress, LBTC_ARB_CONTRACT, 8, 'arb'),
        fetchSolanaMintBalance(solanaAddress, MSOL_MINT),
        fetchSolanaMintBalance(solanaAddress, INF_MINT),
      ]);
      return {
        rEth,
        weEth,
        lbtc,
        mSol,
        inf,
        fetchedAt: new Date().toISOString(),
        hasErrors: [rEth, weEth, lbtc, mSol, inf].some(b => !!b.error),
      };
    },
    { force: opts?.force, allowStaleOnError: true },
  );

  return {
    rEth: data.rEth,
    weEth: data.weEth,
    lbtc: data.lbtc,
    mSol: data.mSol,
    inf: data.inf,
    hasErrors: data.hasErrors,
    fetchedAt: new Date(data.fetchedAt),
  };
}
