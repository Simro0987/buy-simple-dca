// Swap routing comparator service.
// Simulates rate quotes from 14 aggregators using live USD prices from CoinGecko
// as a base, then applies deterministic per-platform variance for realistic comparison.
// NOTE: This tool is read-only — it never executes transactions, only links out.

import type { PriceData } from './crypto';

export type ChainId = 'base' | 'ethereum' | 'arbitrum' | 'solana' | 'native-eth' | 'native-btc' | 'native-sol';

export interface ChainMeta {
  id: ChainId;
  name: string;
  short: string;
  color: string;
  icon: string; // emoji fallback
  gasUsd: number; // baseline gas estimate
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  'base': { id: 'base', name: 'Base', short: 'BASE', color: '#0052FF', icon: '🔵', gasUsd: 0.05 },
  'ethereum': { id: 'ethereum', name: 'Ethereum', short: 'ETH', color: '#627EEA', icon: '⟠', gasUsd: 6.5 },
  'arbitrum': { id: 'arbitrum', name: 'Arbitrum', short: 'ARB', color: '#28A0F0', icon: '🔷', gasUsd: 0.12 },
  'solana': { id: 'solana', name: 'Solana', short: 'SOL', color: '#9945FF', icon: '◎', gasUsd: 0.002 },
  'native-eth': { id: 'native-eth', name: 'ETH (Native)', short: 'ETH', color: '#627EEA', icon: '⟠', gasUsd: 6.5 },
  'native-btc': { id: 'native-btc', name: 'BTC (Native)', short: 'BTC', color: '#F7931A', icon: '₿', gasUsd: 2.5 },
  'native-sol': { id: 'native-sol', name: 'SOL (Native)', short: 'SOL', color: '#9945FF', icon: '◎', gasUsd: 0.002 },
};

export interface TokenMeta {
  symbol: string;
  name: string;
  chain: ChainId;
  priceRef: 'usd' | 'btc' | 'eth' | 'sol';
  multiplier?: number; // vs price ref (e.g. wstETH ~ 1.18 * ETH)
  decimals: number;
}

export const TOKENS: TokenMeta[] = [
  // Base
  { symbol: 'USDC', name: 'USD Coin', chain: 'base', priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT', name: 'Tether', chain: 'base', priceRef: 'usd', decimals: 6 },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', chain: 'base', priceRef: 'btc', decimals: 8 },
  { symbol: 'WETH', name: 'Wrapped Ether', chain: 'base', priceRef: 'eth', decimals: 18 },
  { symbol: 'SOL', name: 'Wormhole SOL', chain: 'base', priceRef: 'sol', decimals: 9 },
  // Ethereum
  { symbol: 'stETH', name: 'Lido Staked ETH', chain: 'ethereum', priceRef: 'eth', multiplier: 0.999, decimals: 18 },
  // Arbitrum
  { symbol: 'wstETH', name: 'Wrapped stETH', chain: 'arbitrum', priceRef: 'eth', multiplier: 1.18, decimals: 18 },
  // Solana
  { symbol: 'JitoSOL', name: 'Jito Staked SOL', chain: 'solana', priceRef: 'sol', multiplier: 1.072, decimals: 9 },
  // Natives
  { symbol: 'ETH', name: 'Ether (Native)', chain: 'native-eth', priceRef: 'eth', decimals: 18 },
  { symbol: 'BTC', name: 'Bitcoin (Native)', chain: 'native-btc', priceRef: 'btc', decimals: 8 },
  { symbol: 'SOL', name: 'Solana (Native)', chain: 'native-sol', priceRef: 'sol', decimals: 9 },
];

export function tokenKey(t: TokenMeta) {
  return `${t.chain}:${t.symbol}`;
}

export function tokenUsdPrice(t: TokenMeta, prices: PriceData | undefined): number {
  if (!prices) return 0;
  const m = t.multiplier ?? 1;
  switch (t.priceRef) {
    case 'usd': return 1 * m;
    case 'btc': return (prices['bitcoin']?.usd ?? 0) * m;
    case 'eth': return (prices['ethereum']?.usd ?? 0) * m;
    case 'sol': return (prices['solana']?.usd ?? 0) * m;
  }
}

export interface Platform {
  id: string;
  name: string;
  type: 'aggregator' | 'dex' | 'bridge' | 'privacy';
  buildUrl: (from: TokenMeta, to: TokenMeta, amount: number) => string;
  // Bias factors (deterministic): edge on output, fee multiplier, extra gas usd.
  edge: number;        // e.g. +0.0012 means +0.12% better output
  feeBps: number;      // protocol fee bps on output
  extraGasUsd: number; // additional infra fee in USD
}

export const PLATFORMS: Platform[] = [
  { id: 'jumper', name: 'Jumper.xyz', type: 'aggregator',
    buildUrl: (f, t, a) => `https://jumper.exchange/?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&fromToken=${f.symbol}&toToken=${t.symbol}&fromAmount=${a}`,
    edge: 0.0015, feeBps: 5, extraGasUsd: 0.0 },
  { id: 'velora', name: 'Velora.xyz', type: 'aggregator',
    buildUrl: () => `https://velora.xyz/`,
    edge: 0.0009, feeBps: 8, extraGasUsd: 0.05 },
  { id: 'paraswap', name: 'ParaSwap', type: 'aggregator',
    buildUrl: (f, t) => `https://app.paraswap.io/#/${f.symbol}-${t.symbol}/SELL?network=${chainQuery(f.chain)}`,
    edge: 0.0011, feeBps: 6, extraGasUsd: 0.02 },
  { id: 'across', name: 'Across Protocol', type: 'bridge',
    buildUrl: (f, t, a) => `https://app.across.to/bridge?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&inputToken=${f.symbol}&outputToken=${t.symbol}&inputAmount=${a}`,
    edge: 0.0008, feeBps: 10, extraGasUsd: 0.3 },
  { id: 'jupiter', name: 'Jupiter AG', type: 'aggregator',
    buildUrl: (f, t, a) => `https://jup.ag/swap/${f.symbol}-${t.symbol}?amount=${a}`,
    edge: 0.0020, feeBps: 4, extraGasUsd: 0.0 },
  { id: 'odos', name: 'Odos.xyz', type: 'aggregator',
    buildUrl: (f, t) => `https://app.odos.xyz/?inputCurrency=${f.symbol}&outputCurrency=${t.symbol}&chainId=${chainNumericId(f.chain)}`,
    edge: 0.0017, feeBps: 5, extraGasUsd: 0.0 },
  { id: 'kyberswap', name: 'KyberSwap', type: 'aggregator',
    buildUrl: (f, t) => `https://kyberswap.com/swap/${chainQuery(f.chain)}/${f.symbol}-to-${t.symbol}`,
    edge: 0.0010, feeBps: 7, extraGasUsd: 0.04 },
  { id: 'symbiosis', name: 'Symbiosis', type: 'bridge',
    buildUrl: () => `https://app.symbiosis.finance/swap`,
    edge: 0.0006, feeBps: 12, extraGasUsd: 0.6 },
  { id: 'cowswap', name: 'CoW Swap', type: 'dex',
    buildUrl: (f, t) => `https://swap.cow.fi/#/1/swap/${f.symbol}/${t.symbol}`,
    edge: 0.0019, feeBps: 3, extraGasUsd: 0.0 },
  { id: 'debridge', name: 'deBridge', type: 'bridge',
    buildUrl: () => `https://app.debridge.finance/`,
    edge: 0.0007, feeBps: 11, extraGasUsd: 0.4 },
  { id: 'matcha', name: 'Matcha', type: 'aggregator',
    buildUrl: (f, t) => `https://matcha.xyz/markets/${chainNumericId(f.chain)}/${f.symbol}`,
    edge: 0.0013, feeBps: 6, extraGasUsd: 0.03 },
  { id: 'trocador', name: 'Trocador', type: 'privacy',
    buildUrl: (f, t, a) => `https://trocador.app/en/?ticker_from=${f.symbol.toLowerCase()}&ticker_to=${t.symbol.toLowerCase()}&network_from=${f.chain}&network_to=${t.chain}&amount=${a}`,
    edge: 0.0004, feeBps: 35, extraGasUsd: 0.8 },
  { id: 'houdini', name: 'Houdiniswap', type: 'privacy',
    buildUrl: () => `https://houdiniswap.com/`,
    edge: 0.0002, feeBps: 40, extraGasUsd: 1.0 },
  { id: 'swapspace', name: 'SwapSpace', type: 'aggregator',
    buildUrl: (f, t) => `https://swapspace.co/exchange/${f.symbol.toLowerCase()}/${t.symbol.toLowerCase()}`,
    edge: 0.0005, feeBps: 30, extraGasUsd: 0.5 },
];

function chainQuery(c: ChainId): string {
  switch (c) {
    case 'base': return '8453';
    case 'ethereum': case 'native-eth': return '1';
    case 'arbitrum': return '42161';
    case 'solana': case 'native-sol': return '1151111081099710';
    case 'native-btc': return 'btc';
  }
}
function chainNumericId(c: ChainId): string {
  switch (c) {
    case 'base': return '8453';
    case 'ethereum': case 'native-eth': return '1';
    case 'arbitrum': return '42161';
    default: return '1';
  }
}

export interface Quote {
  platformId: string;
  platformName: string;
  type: Platform['type'];
  grossOut: number;     // in destination token units
  feeUsd: number;       // protocol + extra
  gasUsd: number;       // network gas
  netOut: number;       // grossOut minus fees converted to dest token
  netOutUsd: number;
  url: string;
  isBest?: boolean;
}

// Deterministic pseudo-random based on string seed, range [-1, 1]
function seededVariance(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = (h >>> 0) / 0xffffffff;
  return x * 2 - 1;
}

export interface QuoteParams {
  from: TokenMeta;
  to: TokenMeta;
  amount: number; // amount of `from` token
  prices: PriceData | undefined;
  // Refreshes every minute so the table feels alive without spamming.
  freshnessTick?: number;
}

export function getQuotes({ from, to, amount, prices, freshnessTick = 0 }: QuoteParams): Quote[] {
  if (!amount || amount <= 0 || !prices) return [];

  const fromUsd = tokenUsdPrice(from, prices);
  const toUsd = tokenUsdPrice(to, prices);
  if (fromUsd <= 0 || toUsd <= 0) return [];

  const grossInUsd = amount * fromUsd;
  const baseOut = grossInUsd / toUsd;

  // Cross-chain swaps incur higher infra fee floor.
  const crossChain = from.chain !== to.chain;
  const chainGas = (CHAINS[from.chain].gasUsd + (crossChain ? CHAINS[to.chain].gasUsd : 0));

  const quotes: Quote[] = PLATFORMS.map(p => {
    const seed = `${p.id}:${from.symbol}:${to.symbol}:${freshnessTick}`;
    const variance = seededVariance(seed); // [-1, 1]

    // Apply ±0.25% randomized edge tweak, and ±0.1% .. +0.4% fee variance.
    const edgeAdj = p.edge + variance * 0.0025;
    const feeBpsAdj = Math.max(0, p.feeBps + (variance > 0 ? variance * 4 : variance * 1));

    const grossOut = baseOut * (1 + edgeAdj);
    const protocolFeeUsd = (grossOut * toUsd) * (feeBpsAdj / 10000);
    const gasUsd = chainGas + p.extraGasUsd * (1 + variance * 0.2);
    const feeUsd = protocolFeeUsd + p.extraGasUsd * (1 + Math.max(0, variance) * 0.2);

    const totalCostUsd = protocolFeeUsd + gasUsd;
    const netOutUsd = grossOut * toUsd - totalCostUsd;
    const netOut = netOutUsd / toUsd;

    return {
      platformId: p.id,
      platformName: p.name,
      type: p.type,
      grossOut,
      feeUsd,
      gasUsd,
      netOut,
      netOutUsd,
      url: p.buildUrl(from, to, amount),
    };
  }).sort((a, b) => b.netOut - a.netOut);

  if (quotes.length) quotes[0].isBest = true;
  return quotes;
}

export function formatTokenAmount(n: number, decimals = 6): string {
  if (!isFinite(n)) return '0';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (abs >= 0.0001) return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return n.toExponential(2);
}

export function formatUsd(n: number): string {
  if (!isFinite(n)) return '$0.00';
  if (Math.abs(n) < 0.01) return '<$0.01';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
