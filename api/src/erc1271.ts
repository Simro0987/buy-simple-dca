import { createPublicClient, http, type Address, type Chain, type Hex } from 'viem';
import { arbitrum, arbitrumSepolia, avalanche, base, baseSepolia, bsc, gnosis, mainnet, optimism, polygon, sepolia } from 'viem/chains';
import type { Erc1271Check } from './auth';

const CHAINS: Chain[] = [mainnet, arbitrum, base, optimism, polygon, gnosis, bsc, avalanche, sepolia, arbitrumSepolia, baseSepolia];
const MAGIC = '0x1626ba7e';
const ABI = [
  {
    type: 'function',
    name: 'isValidSignature',
    stateMutability: 'view',
    inputs: [{ name: 'hash', type: 'bytes32' }, { name: 'signature', type: 'bytes' }],
    outputs: [{ type: 'bytes4' }],
  },
] as const;

/** EIP-1271 check (Safe{Wallet} implements it through its CompatibilityFallbackHandler). */
export function createErc1271Checker(rpcUrls: Record<number, string>): Erc1271Check {
  const clients = new Map<number, ReturnType<typeof createPublicClient>>();
  return async (chainId: number, account: Address, hash: Hex, signature: Hex) => {
    const chain = CHAINS.find((c) => c.id === chainId);
    if (!chain) return false;
    let client = clients.get(chainId);
    if (!client) {
      client = createPublicClient({ chain, transport: http(rpcUrls[chainId], { timeout: 10_000, retryCount: 1 }) });
      clients.set(chainId, client);
    }
    const code = await client.getCode({ address: account });
    if (!code || code === '0x') return false;
    const res = await client.readContract({ address: account, abi: ABI, functionName: 'isValidSignature', args: [hash, signature] });
    return String(res).toLowerCase() === MAGIC;
  };
}

export const SUPPORTED_SIWE_CHAIN_IDS = CHAINS.map((c) => c.id);
