export type ChainId = 'btc' | 'eth' | 'sol' | 'arb';

export interface WalletEntry {
  id: string;
  chain: ChainId;
  label: string;
  address: string;
}

export interface PositionDeposit {
  token: string;       // token user actually deposits (e.g. 'jitoSOL', 'wstETH')
  ratio: number;       // ratio of position amount → deposit amount (1 = 1:1)
  protocol: string;    // where to deposit
  note?: string;       // short Slovak hint
}

export interface StakingPosition {
  label: string;
  type: 'hold' | 'staking' | 'lending';
  percentage: number;
  protocol?: string;
  chain?: string;
  apy?: number;
  yieldDirection?: 'btc' | 'restake' | 'compound' | 'none';
  deposits?: PositionDeposit[];
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
    name: 'Bitcoin — Bridge Base → Native BTC',
    color: '#F7931A',
    allocation: 64,
    positions: [
      { label: 'HODL (HW peňaženka)', type: 'hold', percentage: 42, chain: 'BTC L1', yieldDirection: 'none' },
      { label: 'Babylon Staking (z HW peňaženky)', type: 'staking', percentage: 22, protocol: 'Babylon', chain: 'BTC L1', apy: 7, yieldDirection: 'compound' },
      { label: 'Yield Port — LBTC v Morpho Blue', type: 'lending', percentage: 14, protocol: 'Lombard → Morpho Blue', chain: 'Arbitrum', apy: 11, yieldDirection: 'btc',
        deposits: [{ token: 'LBTC', ratio: 1, protocol: 'Morpho Blue (ARB)', note: 'BTC → LBTC (Lombard) → vlož do Morpho Blue' }] },
    ],
  },
  {
    symbol: 'ETH',
    name: 'Ethereum — Dynamický Split (Rocket Pool + ether.fi)',
    color: '#627EEA',
    allocation: 25,
    positions: [
      { label: 'Native HODL (HW peňaženka)', type: 'hold', percentage: 41, chain: 'Ethereum', yieldDirection: 'none' },
      { label: 'Rocket Pool (rETH)', type: 'staking', percentage: 16, protocol: 'Rocket Pool', chain: 'Ethereum', apy: 3.05, yieldDirection: 'compound',
        deposits: [{ token: 'rETH', ratio: 1, protocol: 'Rocket Pool', note: 'ETH → rETH — decentralizovaný staking, bez lockupu' }] },
      { label: 'ether.fi (weETH)', type: 'staking', percentage: 16, protocol: 'ether.fi', chain: 'Ethereum', apy: 4.38, yieldDirection: 'compound',
        deposits: [{ token: 'weETH', ratio: 1, protocol: 'ether.fi', note: 'ETH → weETH — EigenLayer restaking + ether.fi rewards' }] },
      { label: 'weETH cez DeFi Saver (ARB)', type: 'lending', percentage: 27, protocol: 'ether.fi → DeFi Saver', chain: 'Arbitrum', apy: 9, yieldDirection: 'btc',
        deposits: [{ token: 'weETH', ratio: 1, protocol: 'DeFi Saver (ARB)', note: 'ETH → weETH → bridge na ARB → vlož do DeFi Saver (bez páky)' }] },
    ],
  },
  {
    symbol: 'SOL',
    name: 'Solana — Dynamický Split (Marinade + Sanctum)',
    color: '#9945FF',
    allocation: 11,
    positions: [
      { label: 'HODL (peňaženka)', type: 'hold', percentage: 36, chain: 'Solana', yieldDirection: 'none' },
      { label: 'Marinade Native (mSOL)', type: 'staking', percentage: 32, protocol: 'Marinade', chain: 'Solana', apy: 7.37, yieldDirection: 'compound',
        deposits: [{ token: 'mSOL', ratio: 1, protocol: 'marinade.finance', note: 'SOL → mSOL — Marinade Native Staking, bez lockupu' }] },
      { label: 'Sanctum INF (INF)', type: 'staking', percentage: 32, protocol: 'Sanctum', chain: 'Solana', apy: 8.00, yieldDirection: 'btc',
        deposits: [{ token: 'INF', ratio: 1, protocol: 'sanctum.so', note: 'SOL → INF — Sanctum Infinity multi-LST, výnos → BTC' }] },
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
