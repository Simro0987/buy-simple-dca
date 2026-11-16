import { arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, sepolia, type Chain } from 'viem/chains';

export interface NetworkInfo {
  key: string;
  chain: Chain;
  testnet: boolean;
}

export const NETWORKS: Record<string, NetworkInfo> = {
  'arbitrum-sepolia': { key: 'arbitrum-sepolia', chain: arbitrumSepolia, testnet: true },
  sepolia: { key: 'sepolia', chain: sepolia, testnet: true },
  'base-sepolia': { key: 'base-sepolia', chain: baseSepolia, testnet: true },
  arbitrum: { key: 'arbitrum', chain: arbitrum, testnet: false },
  ethereum: { key: 'ethereum', chain: mainnet, testnet: false },
  base: { key: 'base', chain: base, testnet: false },
};

export const DEFAULT_NETWORK = 'arbitrum-sepolia';
