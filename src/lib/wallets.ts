export interface WalletEntry {
  id: string;
  chain: 'btc' | 'eth' | 'sol' | 'hype';
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

export const STAKING_CONFIG: AssetStakingConfig[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    color: '#F7931A',
    allocation: 59,
    positions: [
      { label: 'Cold Storage (HODL)', type: 'hold', percentage: 100, yieldDirection: 'none' },
    ],
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    color: '#627EEA',
    allocation: 25,
    positions: [
      { label: 'ETH hold', type: 'hold', percentage: 8, chain: 'Ethereum', yieldDirection: 'none' },
      { label: 'rETH staking', type: 'staking', percentage: 23, protocol: 'Rocket Pool', apy: 3.2, yieldDirection: 'btc' },
      { label: 'wstETH hold', type: 'hold', percentage: 53, chain: 'Arbitrum', yieldDirection: 'none' },
      { label: 'wstETH lending', type: 'lending', percentage: 16, protocol: 'Aave V3', apy: 1.8, yieldDirection: 'btc' },
    ],
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    color: '#9945FF',
    allocation: 11,
    positions: [
      { label: 'SOL hold', type: 'hold', percentage: 10, yieldDirection: 'none' },
      { label: 'SOL staking', type: 'staking', percentage: 44, protocol: 'Jito', apy: 7.5, yieldDirection: 'btc' },
      { label: 'JitoSOL hold', type: 'hold', percentage: 27, yieldDirection: 'none' },
      { label: 'JitoSOL lending', type: 'lending', percentage: 19, protocol: 'Kamino', apy: 4.2, yieldDirection: 'btc' },
    ],
  },
  {
    symbol: 'HYPE',
    name: 'Hyperliquid',
    color: '#00D4AA',
    allocation: 5,
    positions: [
      { label: 'HYPE hold', type: 'hold', percentage: 20, yieldDirection: 'none' },
      { label: 'Native staking', type: 'staking', percentage: 80, apy: 12.0, yieldDirection: 'restake' },
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

export function getChainLabel(chain: WalletEntry['chain']): string {
  const labels: Record<string, string> = {
    btc: 'BTC (Trezor)',
    eth: 'ETH (Ledger)',
    sol: 'SOL (Ledger)',
    hype: 'HYPE (Hyperliquid)',
  };
  return labels[chain] || chain.toUpperCase();
}

export function getChainColor(chain: WalletEntry['chain']): string {
  const colors: Record<string, string> = {
    btc: '#F7931A',
    eth: '#627EEA',
    sol: '#9945FF',
    hype: '#00D4AA',
  };
  return colors[chain] || '#888';
}
