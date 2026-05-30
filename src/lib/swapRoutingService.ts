// Swap routing comparator service.
// Read-only: simulates rate quotes from up to 14 aggregators/bridges using live
// USD prices as the base, then applies deterministic per-platform variance.
// Never executes a transaction — only builds deep links for manual execution.

import type { PriceData } from './crypto';

// ============= Networks (chains) =============
// Strict separation: a Network is the underlying chain. Tokens live on a chain.
export type ChainId = 'bitcoin' | 'ethereum' | 'base' | 'arbitrum' | 'solana';

export interface ChainMeta {
  id: ChainId;
  name: string;
  short: string;
  color: string;
  icon: string;
  gasUsd: number;
  family: 'evm' | 'btc' | 'svm';
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  bitcoin:  { id: 'bitcoin',  name: 'Bitcoin Network',    short: 'BTC',  color: '#F7931A', icon: '₿', gasUsd: 2.5,  family: 'btc' },
  ethereum: { id: 'ethereum', name: 'Ethereum Mainnet',   short: 'ETH',  color: '#627EEA', icon: '⟠', gasUsd: 6.5,  family: 'evm' },
  base:     { id: 'base',     name: 'Base Network',       short: 'BASE', color: '#0052FF', icon: '🔵', gasUsd: 0.05, family: 'evm' },
  arbitrum: { id: 'arbitrum', name: 'Arbitrum (ARB)',     short: 'ARB',  color: '#28A0F0', icon: '🔷', gasUsd: 0.12, family: 'evm' },
  solana:   { id: 'solana',   name: 'Solana Network',     short: 'SOL',  color: '#9945FF', icon: '◎', gasUsd: 0.002, family: 'svm' },
};

export const CHAIN_ORDER: ChainId[] = ['bitcoin', 'ethereum', 'base', 'arbitrum', 'solana'];

// ============= Tokens =============
export interface TokenMeta {
  symbol: string;
  name: string;
  chain: ChainId;
  priceRef: 'usd' | 'btc' | 'eth' | 'sol';
  multiplier?: number;
  decimals: number;
  native?: boolean;
}

export const TOKENS: TokenMeta[] = [
  // Bitcoin Network — native BTC only
  { symbol: 'BTC',     name: 'Bitcoin',              chain: 'bitcoin',  priceRef: 'btc', decimals: 8, native: true },
  // Ethereum Mainnet
  { symbol: 'ETH',     name: 'Ether (Native)',       chain: 'ethereum', priceRef: 'eth', decimals: 18, native: true },
  { symbol: 'stETH',   name: 'Lido Staked ETH',      chain: 'ethereum', priceRef: 'eth', multiplier: 0.999, decimals: 18 },
  // Base Network
  { symbol: 'USDC',    name: 'USD Coin',             chain: 'base',     priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT',    name: 'Tether',               chain: 'base',     priceRef: 'usd', decimals: 6 },
  { symbol: 'cbBTC',   name: 'Coinbase Wrapped BTC', chain: 'base',     priceRef: 'btc', decimals: 8 },
  { symbol: 'WETH',    name: 'Wrapped Ether',        chain: 'base',     priceRef: 'eth', decimals: 18 },
  { symbol: 'SOL',     name: 'Wormhole SOL',         chain: 'base',     priceRef: 'sol', decimals: 9 },
  // Arbitrum
  { symbol: 'wstETH',  name: 'Wrapped stETH',        chain: 'arbitrum', priceRef: 'eth', multiplier: 1.18, decimals: 18 },
  // Solana Network
  { symbol: 'SOL',     name: 'Solana (Native)',      chain: 'solana',   priceRef: 'sol', decimals: 9, native: true },
  { symbol: 'JitoSOL', name: 'Jito Staked SOL',      chain: 'solana',   priceRef: 'sol', multiplier: 1.072, decimals: 9 },
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

// ============= Swap type detection =============
export type SwapType = 'same-chain' | 'cross-chain';

export function detectSwapType(from: TokenMeta, to: TokenMeta): SwapType {
  return from.chain === to.chain ? 'same-chain' : 'cross-chain';
}

export function involvesSolana(from: TokenMeta, to: TokenMeta): boolean {
  return from.chain === 'solana' || to.chain === 'solana';
}
export function involvesBitcoin(from: TokenMeta, to: TokenMeta): boolean {
  return from.chain === 'bitcoin' || to.chain === 'bitcoin';
}

// ============= Platforms =============
export interface Platform {
  id: string;
  name: string;
  type: 'aggregator' | 'dex' | 'bridge' | 'privacy';
  buildUrl: (from: TokenMeta, to: TokenMeta, amount: number) => string;
  edge: number;          // baseline +output bias
  feeBps: number;        // protocol fee (bps of output)
  extraGasUsd: number;   // additional infra fee
  bridgeFeeBps?: number; // additional cross-chain bridge fee
  estTimeMin: number;    // estimated time minutes (cross-chain typical)
  supports: (from: TokenMeta, to: TokenMeta, type: SwapType) => boolean;
}

const EVM_CHAINS: ChainId[] = ['ethereum', 'base', 'arbitrum'];
const isEvm = (c: ChainId) => EVM_CHAINS.includes(c);

export const PLATFORMS: Platform[] = [
  // Universal aggregator — handles same-chain EVM + cross-chain across BTC/EVM/SOL
  { id: 'jumper', name: 'Jumper.xyz', type: 'aggregator',
    buildUrl: (f, t, a) => `https://jumper.exchange/?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&fromToken=${f.symbol}&toToken=${t.symbol}&fromAmount=${a}`,
    edge: 0.0015, feeBps: 5, extraGasUsd: 0.0, bridgeFeeBps: 8, estTimeMin: 3,
    supports: () => true },

  // Same-chain EVM aggregators
  { id: 'odos', name: 'Odos.xyz', type: 'aggregator',
    buildUrl: (f, t) => `https://app.odos.xyz/?inputCurrency=${f.symbol}&outputCurrency=${t.symbol}&chainId=${chainNumericId(f.chain)}`,
    edge: 0.0017, feeBps: 5, extraGasUsd: 0.0, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain) },
  { id: 'paraswap', name: 'ParaSwap', type: 'aggregator',
    buildUrl: (f, t) => `https://app.paraswap.io/#/${f.symbol}-${t.symbol}/SELL?network=${chainQuery(f.chain)}`,
    edge: 0.0011, feeBps: 6, extraGasUsd: 0.02, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain) },
  { id: 'cowswap', name: 'CoW Swap', type: 'dex',
    buildUrl: (f, t) => `https://swap.cow.fi/#/${chainNumericId(f.chain)}/swap/${f.symbol}/${t.symbol}`,
    edge: 0.0019, feeBps: 3, extraGasUsd: 0.0, estTimeMin: 3,
    // CoW Swap: same-chain EVM only (Ethereum/Arbitrum/Base). No cross-chain, no Solana.
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain) },
  { id: 'matcha', name: 'Matcha.xyz', type: 'aggregator',
    buildUrl: (f, t) => `https://matcha.xyz/markets/${chainNumericId(f.chain)}/${f.symbol}`,
    edge: 0.0013, feeBps: 6, extraGasUsd: 0.03, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain) },
  { id: 'kyberswap', name: 'KyberSwap', type: 'aggregator',
    buildUrl: (f, t) => `https://kyberswap.com/swap/${chainQuery(f.chain)}/${f.symbol}-to-${t.symbol}`,
    edge: 0.0010, feeBps: 7, extraGasUsd: 0.04, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain) },

  // Solana-centric
  { id: 'jupiter', name: 'Jupiter AG', type: 'aggregator',
    buildUrl: (f, t, a) => `https://jup.ag/swap/${f.symbol}-${t.symbol}?amount=${a}`,
    edge: 0.0028, feeBps: 4, extraGasUsd: 0.0, estTimeMin: 1,
    // Jupiter handles native Solana swaps best; also some cross-chain via Jupiter Bridge.
    supports: (f, t) => f.chain === 'solana' && t.chain === 'solana' },

  // Cross-chain bridges / aggregators
  { id: 'across', name: 'Across Protocol', type: 'bridge',
    buildUrl: (f, t, a) => `https://app.across.to/bridge?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&inputToken=${f.symbol}&outputToken=${t.symbol}&inputAmount=${a}`,
    edge: 0.0008, feeBps: 4, extraGasUsd: 0.3, bridgeFeeBps: 6, estTimeMin: 2,
    // Across: EVM <-> EVM only (Eth/Base/Arb). No Bitcoin, no Solana.
    supports: (f, t, type) => type === 'cross-chain' && isEvm(f.chain) && isEvm(t.chain) },
  { id: 'symbiosis', name: 'Symbiosis Finance', type: 'bridge',
    buildUrl: () => `https://app.symbiosis.finance/swap`,
    edge: 0.0006, feeBps: 8, extraGasUsd: 0.6, bridgeFeeBps: 14, estTimeMin: 6,
    // Symbiosis supports BTC, EVM and Solana cross-chain.
    supports: (f, t, type) => type === 'cross-chain' },
  { id: 'debridge', name: 'deBridge.com', type: 'bridge',
    buildUrl: () => `https://app.debridge.finance/`,
    edge: 0.0007, feeBps: 6, extraGasUsd: 0.4, bridgeFeeBps: 12, estTimeMin: 4,
    // deBridge: EVM <-> EVM and EVM <-> Solana. No native Bitcoin.
    supports: (f, t, type) => type === 'cross-chain' && !involvesBitcoin(f, t) },
  { id: 'velora', name: 'Velora.xyz', type: 'aggregator',
    buildUrl: () => `https://velora.xyz/`,
    edge: 0.0009, feeBps: 8, extraGasUsd: 0.05, bridgeFeeBps: 10, estTimeMin: 5,
    // Velora prioritized for cross-chain routing across EVM ecosystems.
    supports: (f, t, type) => type === 'cross-chain' && !involvesBitcoin(f, t) },
  { id: 'trocador', name: 'Trocador.app', type: 'privacy',
    buildUrl: (f, t, a) => `https://trocador.app/en/?ticker_from=${f.symbol.toLowerCase()}&ticker_to=${t.symbol.toLowerCase()}&network_from=${f.chain}&network_to=${t.chain}&amount=${a}`,
    edge: 0.0004, feeBps: 25, extraGasUsd: 0.8, bridgeFeeBps: 30, estTimeMin: 15,
    supports: (_f, _t, type) => type === 'cross-chain' },
  { id: 'houdini', name: 'Houdiniswap.com', type: 'privacy',
    buildUrl: () => `https://houdiniswap.com/`,
    edge: 0.0002, feeBps: 30, extraGasUsd: 1.0, bridgeFeeBps: 40, estTimeMin: 20,
    supports: (_f, _t, type) => type === 'cross-chain' },
  { id: 'swapspace', name: 'Swapspace.co', type: 'aggregator',
    buildUrl: (f, t) => `https://swapspace.co/exchange/${f.symbol.toLowerCase()}/${t.symbol.toLowerCase()}`,
    edge: 0.0005, feeBps: 25, extraGasUsd: 0.5, bridgeFeeBps: 25, estTimeMin: 12,
    supports: (_f, _t, type) => type === 'cross-chain' },
];

function chainQuery(c: ChainId): string {
  switch (c) {
    case 'base': return '8453';
    case 'ethereum': return '1';
    case 'arbitrum': return '42161';
    case 'solana': return '1151111081099710';
    case 'bitcoin': return 'btc';
  }
}
function chainNumericId(c: ChainId): string {
  switch (c) {
    case 'base': return '8453';
    case 'ethereum': return '1';
    case 'arbitrum': return '42161';
    default: return '1';
  }
}

// ============= Quotes =============
export interface Quote {
  platformId: string;
  platformName: string;
  type: Platform['type'];
  grossOut: number;
  feeUsd: number;
  bridgeFeeUsd: number;
  gasUsd: number;
  netOut: number;
  netOutUsd: number;
  estTimeMin: number;
  url: string;
  isBest?: boolean;
  supported: boolean;
  prioritized?: boolean;
}

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
  amount: number;
  prices: PriceData | undefined;
  freshnessTick?: number;
}

export interface QuoteResult {
  swapType: SwapType;
  quotes: Quote[];
  best: Quote | null;
}

export function getQuotes({ from, to, amount, prices, freshnessTick = 0 }: QuoteParams): QuoteResult {
  const swapType = detectSwapType(from, to);
  if (!amount || amount <= 0 || !prices) return { swapType, quotes: [], best: null };

  const fromUsd = tokenUsdPrice(from, prices);
  const toUsd = tokenUsdPrice(to, prices);
  if (fromUsd <= 0 || toUsd <= 0) return { swapType, quotes: [], best: null };

  const grossInUsd = amount * fromUsd;
  const baseOut = grossInUsd / toUsd;

  const chainGas = CHAINS[from.chain].gasUsd + (swapType === 'cross-chain' ? CHAINS[to.chain].gasUsd : 0);
  const solInvolved = involvesSolana(from, to);

  const all: Quote[] = PLATFORMS.map(p => {
    const supported = p.supports(from, to, swapType);
    const seed = `${p.id}:${from.chain}:${from.symbol}:${to.chain}:${to.symbol}:${freshnessTick}`;
    const variance = seededVariance(seed);

    // Solana prioritization: Jupiter gets the strongest boost; Jumper/deBridge a smaller boost.
    let priorityEdge = 0;
    let prioritized = false;
    if (solInvolved) {
      if (p.id === 'jupiter') { priorityEdge = 0.0025; prioritized = true; }
      else if (p.id === 'jumper' || p.id === 'debridge') { priorityEdge = 0.0008; prioritized = true; }
    } else if (swapType === 'same-chain' && isEvm(from.chain)) {
      if (['odos', 'paraswap', 'cowswap', 'matcha', 'kyberswap'].includes(p.id)) {
        priorityEdge = 0.0007; prioritized = true;
      }
    } else if (swapType === 'cross-chain') {
      if (['jumper', 'across', 'symbiosis', 'debridge', 'velora', 'trocador', 'houdini', 'swapspace'].includes(p.id)) {
        priorityEdge = 0.0006; prioritized = true;
      }
    }

    const edgeAdj = p.edge + priorityEdge + variance * 0.0020;
    const feeBpsAdj = Math.max(0, p.feeBps + (variance > 0 ? variance * 4 : variance * 1));

    const grossOut = baseOut * (1 + edgeAdj);
    const protocolFeeUsd = (grossOut * toUsd) * (feeBpsAdj / 10000);
    const bridgeFeeUsd = swapType === 'cross-chain' && p.bridgeFeeBps
      ? (grossOut * toUsd) * (p.bridgeFeeBps / 10000)
      : 0;
    const gasUsd = chainGas + p.extraGasUsd * (1 + variance * 0.2);

    const totalCostUsd = protocolFeeUsd + bridgeFeeUsd + gasUsd;
    const netOutUsd = Math.max(0, grossOut * toUsd - totalCostUsd);
    const netOut = netOutUsd / toUsd;
    const estTimeMin = Math.max(0.5, p.estTimeMin * (1 + variance * 0.15));

    return {
      platformId: p.id,
      platformName: p.name,
      type: p.type,
      grossOut,
      feeUsd: protocolFeeUsd,
      bridgeFeeUsd,
      gasUsd,
      netOut,
      netOutUsd,
      estTimeMin,
      url: p.buildUrl(from, to, amount),
      supported,
      prioritized,
    };
  });

  // Sort supported first by netOut; for cross-chain apply a small time penalty
  // so a marginally-better output at 20min loses to a near-equal output at 2min.
  const sorted = all.sort((a, b) => {
    if (a.supported !== b.supported) return a.supported ? -1 : 1;
    if (swapType === 'cross-chain') {
      const aScore = a.netOutUsd - a.estTimeMin * 0.02;
      const bScore = b.netOutUsd - b.estTimeMin * 0.02;
      return bScore - aScore;
    }
    return b.netOut - a.netOut;
  });

  const best = sorted.find(q => q.supported) ?? null;
  if (best) best.isBest = true;
  return { swapType, quotes: sorted, best };
}

export function formatTokenAmount(n: number, _decimals = 6): string {
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

export function formatMin(n: number): string {
  if (n < 1) return `${Math.round(n * 60)}s`;
  if (n < 10) return `~${n.toFixed(1)}m`;
  return `~${Math.round(n)}m`;
}
