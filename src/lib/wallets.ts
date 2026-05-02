export type ChainId = 'btc' | 'eth' | 'sol' | 'arb';

export interface WalletEntry {
  id: string;
  chain: ChainId;
  label: string;
  address: string;
}

export interface StakingPosition {
  label: string;
  type: 'hold' | 'staking' | 'lending';
  percentage: number;
  protocol?: string;
  chain?: string;
  apy?: number;
  yieldDirection?: 'btc' | 'restake' | 'compound' | 'none';
}

export interface AssetStakingConfig {
  symbol: string;
  name: string;
  color: string;
  allocation: number;
  positions: StakingPosition[];
}

// Master Protokol 2026 — Multi-chain accumulation cez Base, mesačná očista a presun
export const STAKING_CONFIG: AssetStakingConfig[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin (cbBTC → Native BTC)',
    color: '#F7931A',
    allocation: 64,
    positions: [
      { label: 'Cold Storage (Native BTC)', type: 'hold', percentage: 64, chain: 'BTC L1', yieldDirection: 'none' },
      { label: 'Babylon Staking (Native BTC)', type: 'staking', percentage: 22, protocol: 'Babylon', chain: 'BTC L1', apy: 4, yieldDirection: 'compound' },
      { label: 'LBTC vault (Lombard)', type: 'lending', percentage: 14, protocol: 'Beefy / Lombard', chain: 'Arbitrum', apy: 11, yieldDirection: 'btc' },
    ],
  },
  {
    symbol: 'ETH',
    name: 'Ethereum (WETH → Native ETH)',
    color: '#627EEA',
    allocation: 25,
    positions: [
      { label: 'Native ETH (HODL)', type: 'hold', percentage: 41, chain: 'Ethereum', yieldDirection: 'none' },
      { label: 'stETH (Lido)', type: 'staking', percentage: 32, protocol: 'Lido (CoW Swap)', chain: 'Ethereum', apy: 3.2, yieldDirection: 'compound' },
      { label: 'rETH vault', type: 'lending', percentage: 27, protocol: 'Beefy / Rocket Pool', chain: 'Arbitrum', apy: 9, yieldDirection: 'btc' },
    ],
  },
  {
    symbol: 'SOL',
    name: 'Solana (SOL → Native SOL)',
    color: '#9945FF',
    allocation: 11,
    positions: [
      { label: 'Native SOL (Phantom HODL)', type: 'hold', percentage: 36, chain: 'Solana', yieldDirection: 'none' },
      { label: 'jitoSOL (Staking + MEV)', type: 'staking', percentage: 33, protocol: 'Jito (Jupiter)', chain: 'Solana', apy: 7.5, yieldDirection: 'compound' },
      { label: 'jitoSOL Multiply vault', type: 'lending', percentage: 31, protocol: 'Kamino Multiply', chain: 'Solana', apy: 16, yieldDirection: 'btc' },
    ],
  },
];

const WALLET_STORAGE_KEY = 'crypto-wallets';

export function loadWallets(): WalletEntry[] {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWallets(wallets: WalletEntry[]): void {
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallets));
}

export function getChainLabel(chain: ChainId): string {
  const labels: Record<ChainId, string> = {
    btc: 'BTC (Taproot)',
    eth: 'ETH (Mainnet)',
    sol: 'SOL (Solana)',
    arb: 'ARB (Arbitrum)',
  };
  return labels[chain] || (chain as string).toUpperCase();
}

export function getChainColor(chain: ChainId): string {
  const colors: Record<ChainId, string> = {
    btc: '#F7931A',
    eth: '#627EEA',
    sol: '#9945FF',
    arb: '#28A0F0',
  };
  return colors[chain] || '#888';
}

export function getExplorerUrl(chain: ChainId, address: string): string {
  switch (chain) {
    case 'btc': return `https://mempool.space/address/${address}`;
    case 'eth': return `https://etherscan.io/address/${address}`;
    case 'sol': return `https://solscan.io/account/${address}`;
    case 'arb': return `https://arbiscan.io/address/${address}`;
  }
}
