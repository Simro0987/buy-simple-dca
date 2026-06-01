// Swap routing comparator service.
// Read-only: simulates rate quotes from up to 14 aggregators/bridges using live
// USD prices as the base, then applies deterministic per-platform variance.
// Never executes a transaction — only builds deep links for manual execution.

import type { PriceData } from './crypto';

// ============= Networks (chains) =============
export type ChainId =
  | 'bitcoin'
  | 'lightning'
  | 'ethereum'
  | 'base'
  | 'arbitrum'
  | 'polygon'
  | 'avalanche'
  | 'solana'
  | 'monero';

export interface ChainMeta {
  id: ChainId;
  name: string;
  short: string;
  color: string;
  icon: string;
  gasUsd: number;
  family: 'evm' | 'btc' | 'svm' | 'privacy' | 'lightning';
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  bitcoin:   { id: 'bitcoin',   name: 'Bitcoin Network',          short: 'BTC',   color: '#F7931A', icon: '₿', gasUsd: 2.5,  family: 'btc' },
  lightning: { id: 'lightning', name: 'Bitcoin Lightning (LN)',   short: 'LN',    color: '#FBBF24', icon: '⚡', gasUsd: 0.01, family: 'lightning' },
  ethereum:  { id: 'ethereum',  name: 'Ethereum Mainnet',         short: 'ETH',   color: '#627EEA', icon: '⟠', gasUsd: 6.5,  family: 'evm' },
  base:      { id: 'base',      name: 'Base Network',             short: 'BASE',  color: '#0052FF', icon: '🔵', gasUsd: 0.05, family: 'evm' },
  arbitrum:  { id: 'arbitrum',  name: 'Arbitrum (ARB)',           short: 'ARB',   color: '#28A0F0', icon: '🔷', gasUsd: 0.12, family: 'evm' },
  polygon:   { id: 'polygon',   name: 'Polygon Network',          short: 'POL',   color: '#8247E5', icon: '🟣', gasUsd: 0.01, family: 'evm' },
  avalanche: { id: 'avalanche', name: 'Avalanche (AVAX)',         short: 'AVAX',  color: '#E84142', icon: '🔺', gasUsd: 0.05, family: 'evm' },
  solana:    { id: 'solana',    name: 'Solana Network',           short: 'SOL',   color: '#9945FF', icon: '◎', gasUsd: 0.002, family: 'svm' },
  monero:    { id: 'monero',    name: 'Monero Network',           short: 'XMR',   color: '#FF6600', icon: 'ɱ', gasUsd: 0.05, family: 'privacy' },
};

export const CHAIN_ORDER: ChainId[] = [
  'bitcoin', 'lightning', 'ethereum', 'base', 'arbitrum', 'polygon', 'avalanche', 'solana', 'monero',
];

// ============= Tokens =============
export interface TokenMeta {
  symbol: string;
  name: string;
  chain: ChainId;
  priceRef: 'usd' | 'btc' | 'eth' | 'sol' | 'avax' | 'pol' | 'xmr';
  multiplier?: number;
  decimals: number;
  native?: boolean;
}

export const TOKENS: TokenMeta[] = [
  // Bitcoin Network
  { symbol: 'BTC',         name: 'Bitcoin',                     chain: 'bitcoin',   priceRef: 'btc', decimals: 8, native: true },
  // Bitcoin Lightning Network
  { symbol: 'Bitcoin LN',  name: 'Bitcoin Lightning',           chain: 'lightning', priceRef: 'btc', decimals: 8, native: true },
  // Ethereum Mainnet
  { symbol: 'ETH',         name: 'Ether (Native)',              chain: 'ethereum',  priceRef: 'eth', decimals: 18, native: true },
  { symbol: 'stETH',       name: 'Lido Staked ETH',             chain: 'ethereum',  priceRef: 'eth', multiplier: 0.999, decimals: 18 },
  // Base Network
  { symbol: 'USDC',        name: 'USD Coin',                    chain: 'base',      priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT',        name: 'Tether',                      chain: 'base',      priceRef: 'usd', decimals: 6 },
  { symbol: 'cbBTC',       name: 'Coinbase Wrapped BTC',        chain: 'base',      priceRef: 'btc', decimals: 8 },
  { symbol: 'WETH',        name: 'Wrapped Ether',               chain: 'base',      priceRef: 'eth', decimals: 18 },
  { symbol: 'SOL',         name: 'Wormhole SOL',                chain: 'base',      priceRef: 'sol', decimals: 9 },
  // Arbitrum
  { symbol: 'USDC',        name: 'USD Coin',                    chain: 'arbitrum',  priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT',        name: 'Tether',                      chain: 'arbitrum',  priceRef: 'usd', decimals: 6 },
  { symbol: 'wstETH',      name: 'Wrapped stETH',               chain: 'arbitrum',  priceRef: 'eth', multiplier: 1.18, decimals: 18 },
  // Polygon
  { symbol: 'USDC',        name: 'USD Coin (native)',           chain: 'polygon',   priceRef: 'usd', decimals: 6 },
  { symbol: 'USDC.e',      name: 'USD Coin (bridged)',          chain: 'polygon',   priceRef: 'usd', multiplier: 0.998, decimals: 6 },
  { symbol: 'USDT',        name: 'Tether',                      chain: 'polygon',   priceRef: 'usd', decimals: 6 },
  { symbol: 'POL',         name: 'Polygon (ex-MATIC)',          chain: 'polygon',   priceRef: 'pol', decimals: 18, native: true },
  // Solana
  { symbol: 'SOL',         name: 'Solana (Native)',             chain: 'solana',    priceRef: 'sol', decimals: 9, native: true },
  { symbol: 'JitoSOL',     name: 'Jito Staked SOL',             chain: 'solana',    priceRef: 'sol', multiplier: 1.072, decimals: 9 },
  { symbol: 'USDC',        name: 'USD Coin',                    chain: 'solana',    priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT',        name: 'Tether',                      chain: 'solana',    priceRef: 'usd', decimals: 6 },
  // Avalanche
  { symbol: 'AVAX',        name: 'Avalanche (Native)',          chain: 'avalanche', priceRef: 'avax', decimals: 18, native: true },
  { symbol: 'USDC',        name: 'USD Coin',                    chain: 'avalanche', priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT',        name: 'Tether',                      chain: 'avalanche', priceRef: 'usd', decimals: 6 },
  // Monero
  { symbol: 'XMR',         name: 'Monero',                      chain: 'monero',    priceRef: 'xmr', decimals: 12, native: true },
];

export function tokenKey(t: TokenMeta) {
  return `${t.chain}:${t.symbol}`;
}

// Reference fallback prices used when CoinGecko hook doesn't include the asset.
const FALLBACK_USD: Record<string, number> = {
  pol: 0.45,
  avax: 28,
  xmr: 165,
};

export function tokenUsdPrice(t: TokenMeta, prices: PriceData | undefined): number {
  const m = t.multiplier ?? 1;
  if (!prices) {
    if (t.priceRef === 'usd') return 1 * m;
    return (FALLBACK_USD[t.priceRef] ?? 0) * m;
  }
  switch (t.priceRef) {
    case 'usd':  return 1 * m;
    case 'btc':  return (prices['bitcoin']?.usd ?? 0) * m;
    case 'eth':  return (prices['ethereum']?.usd ?? 0) * m;
    case 'sol':  return (prices['solana']?.usd ?? 0) * m;
    case 'avax': return ((prices as any)['avalanche-2']?.usd ?? FALLBACK_USD.avax) * m;
    case 'pol':  return ((prices as any)['matic-network']?.usd ?? (prices as any)['polygon-ecosystem-token']?.usd ?? FALLBACK_USD.pol) * m;
    case 'xmr':  return ((prices as any)['monero']?.usd ?? FALLBACK_USD.xmr) * m;
  }
}

// ============= Swap type detection =============
export type SwapType = 'same-chain' | 'cross-chain';

export function detectSwapType(from: TokenMeta, to: TokenMeta): SwapType {
  return from.chain === to.chain ? 'same-chain' : 'cross-chain';
}

const PRIVACY_CHAINS: ChainId[] = ['monero', 'lightning'];
export function involvesPrivacy(from: TokenMeta, to: TokenMeta): boolean {
  return PRIVACY_CHAINS.includes(from.chain) || PRIVACY_CHAINS.includes(to.chain);
}
export function involvesSolana(from: TokenMeta, to: TokenMeta): boolean {
  return from.chain === 'solana' || to.chain === 'solana';
}
export function involvesBitcoin(from: TokenMeta, to: TokenMeta): boolean {
  return from.chain === 'bitcoin' || to.chain === 'bitcoin';
}

// Submarine swap detection: Lightning <-> Polygon stables (USDC/USDT).
// These routes are fixed-rate (locked before execution) so they bypass AMM math.
const POLYGON_STABLES = ['USDC', 'USDT', 'USDC.e'];
export function isSubmarineRoute(from: TokenMeta, to: TokenMeta): boolean {
  const lnToPolyStable =
    from.chain === 'lightning' && to.chain === 'polygon' && POLYGON_STABLES.includes(to.symbol);
  const polyStableToLn =
    to.chain === 'lightning' && from.chain === 'polygon' && POLYGON_STABLES.includes(from.symbol);
  return lnToPolyStable || polyStableToLn;
}

// Providers that route LN <-> Polygon stables via submarine swaps / fixed-rate desks.
export const SUBMARINE_PROVIDERS = [
  'boltz', 'exolix', 'fixedfloat', 'sideshift', 'changenow', 'houdini', 'trocador', 'swapspace',
];
// Subset that explicitly advertises a guaranteed fixed-rate quote.
export const FIXED_RATE_PROVIDERS = ['boltz', 'exolix', 'fixedfloat'];

// ============= Slippage & Price Impact constants =============
// Hardcoded conservative max slippage (0.5%) applied uniformly to every route.
export const MAX_SLIPPAGE_BPS = 50;                // 0.5%
export const MAX_SLIPPAGE_PCT = MAX_SLIPPAGE_BPS / 100;
export const PRICE_IMPACT_WARN_PCT = 1.5;          // yellow badge above this
export const PRICE_IMPACT_UNSAFE_PCT = 3.0;        // red badge + push to bottom

// ============= Platforms =============
export interface Platform {
  id: string;
  name: string;
  type: 'aggregator' | 'dex' | 'bridge' | 'privacy';
  buildUrl: (from: TokenMeta, to: TokenMeta, amount: number) => string;
  edge: number;
  feeBps: number;
  extraGasUsd: number;
  bridgeFeeBps?: number;
  estTimeMin: number;
  // Approximate effective liquidity (USD) used to simulate price impact.
  // Higher = deeper pools = lower impact for the same trade size. Optional;
  // platforms that don't set it fall back to DEFAULT_LIQUIDITY_USD.
  liquidityUsd?: number;
  supports: (from: TokenMeta, to: TokenMeta, type: SwapType) => boolean;
}

// Default liquidity tiers used when a platform doesn't override liquidityUsd.
// Major aggregators -> deep; bridges -> medium; privacy/instant -> thin.
const DEFAULT_LIQUIDITY_USD: Record<Platform['type'], number> = {
  aggregator: 80_000_000,
  dex:        45_000_000,
  bridge:     25_000_000,
  privacy:    1_200_000,
};

const EVM_CHAINS: ChainId[] = ['ethereum', 'base', 'arbitrum', 'polygon', 'avalanche'];
const isEvm = (c: ChainId) => EVM_CHAINS.includes(c);
const isPrivacy = (c: ChainId) => PRIVACY_CHAINS.includes(c);

export const PLATFORMS: Platform[] = [
  // LI.FI-powered universal aggregator (EVM + SOL + BTC). No LN/XMR.
  { id: 'jumper', name: 'Jumper.xyz', type: 'aggregator',
    buildUrl: (f, t, a) => `https://jumper.exchange/?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&fromToken=${encodeURIComponent(f.symbol)}&toToken=${encodeURIComponent(t.symbol)}&fromAmount=${a}`,
    edge: 0.0015, feeBps: 5, extraGasUsd: 0.0, bridgeFeeBps: 8, estTimeMin: 3,
    supports: (f, t) => !isPrivacy(f.chain) && !isPrivacy(t.chain) },

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
    // Same-chain EVM only (Eth/Arb/Base/Polygon). Not Avalanche, no cross-chain, no Solana/BTC/LN/XMR.
    supports: (f, t, type) => type === 'same-chain' && ['ethereum', 'arbitrum', 'base', 'polygon'].includes(f.chain) },
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
    supports: (f, t) => f.chain === 'solana' && t.chain === 'solana' },

  // Cross-chain bridges / aggregators (EVM-focused)
  { id: 'across', name: 'Across Protocol', type: 'bridge',
    buildUrl: (f, t, a) => `https://app.across.to/bridge?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&inputToken=${f.symbol}&outputToken=${t.symbol}&inputAmount=${a}`,
    edge: 0.0008, feeBps: 4, extraGasUsd: 0.3, bridgeFeeBps: 6, estTimeMin: 2,
    // Across: EVM <-> EVM only (Eth/Base/Arb/Polygon). No Avalanche L1, no BTC, no Solana, no LN/XMR.
    supports: (f, t, type) => type === 'cross-chain'
      && ['ethereum', 'base', 'arbitrum', 'polygon'].includes(f.chain)
      && ['ethereum', 'base', 'arbitrum', 'polygon'].includes(t.chain) },
  { id: 'symbiosis', name: 'Symbiosis Finance', type: 'bridge',
    buildUrl: () => `https://app.symbiosis.finance/swap`,
    edge: 0.0006, feeBps: 8, extraGasUsd: 0.6, bridgeFeeBps: 14, estTimeMin: 6,
    supports: (f, t, type) => type === 'cross-chain' && !isPrivacy(f.chain) && !isPrivacy(t.chain) },
  { id: 'debridge', name: 'deBridge.com', type: 'bridge',
    buildUrl: () => `https://app.debridge.finance/`,
    edge: 0.0007, feeBps: 6, extraGasUsd: 0.4, bridgeFeeBps: 12, estTimeMin: 4,
    // EVM <-> EVM and EVM <-> Solana. No BTC, no LN, no XMR.
    supports: (f, t, type) => type === 'cross-chain' && !involvesBitcoin(f, t) && !isPrivacy(f.chain) && !isPrivacy(t.chain) },
  { id: 'velora', name: 'Velora.xyz', type: 'aggregator',
    buildUrl: () => `https://velora.xyz/`,
    edge: 0.0009, feeBps: 8, extraGasUsd: 0.05, bridgeFeeBps: 10, estTimeMin: 5,
    supports: (f, t, type) => type === 'cross-chain' && !involvesBitcoin(f, t) && !isPrivacy(f.chain) && !isPrivacy(t.chain) },

  // Privacy / instant cross-chain — these ARE the ones that support LN & XMR
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

  // ============= 8 new premium integrations =============
  // THORSwap: native BTC/ETH/AVAX cross-chain via THORChain
  { id: 'thorswap', name: 'THORSwap', type: 'bridge',
    buildUrl: (f, t) => `https://app.thorswap.finance/swap?input=${f.chain}.${f.symbol}&output=${t.chain}.${t.symbol}`,
    edge: 0.0010, feeBps: 10, extraGasUsd: 0.5, bridgeFeeBps: 15, estTimeMin: 8,
    // Native-asset cross-chain only (BTC/ETH/AVAX and major EVM). No LN/XMR/Solana.
    supports: (f, t, type) => type === 'cross-chain'
      && !isPrivacy(f.chain) && !isPrivacy(t.chain)
      && f.chain !== 'solana' && t.chain !== 'solana'
      && (['bitcoin', 'ethereum', 'avalanche'].includes(f.chain) || ['bitcoin', 'ethereum', 'avalanche'].includes(t.chain)) },

  // 1inch: same-chain EVM aggregator (top tier)
  { id: '1inch', name: '1inch', type: 'aggregator',
    buildUrl: (f, t) => `https://app.1inch.io/#/${chainNumericId(f.chain)}/simple/swap/${f.symbol}/${t.symbol}`,
    edge: 0.0018, feeBps: 4, extraGasUsd: 0.0, estTimeMin: 1,
    supports: (f, _t, type) => type === 'same-chain' && isEvm(f.chain) },

  // OpenOcean: multi-chain EVM + Solana aggregator
  { id: 'openocean', name: 'OpenOcean', type: 'aggregator',
    buildUrl: (f, t) => `https://app.openocean.finance/classic#/${(CHAINS[f.chain].short || '').toUpperCase()}/${f.symbol}/${t.symbol}`,
    edge: 0.0012, feeBps: 6, extraGasUsd: 0.03, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && (isEvm(f.chain) || f.chain === 'solana') },

  // Bungee (Socket): cross-chain EVM bridge aggregator
  { id: 'bungee', name: 'Bungee.exchange', type: 'bridge',
    buildUrl: (f, t, a) => `https://www.bungee.exchange/?fromChainId=${chainNumericId(f.chain)}&toChainId=${chainNumericId(t.chain)}&fromTokenSymbol=${f.symbol}&toTokenSymbol=${t.symbol}&amount=${a}`,
    edge: 0.0009, feeBps: 5, extraGasUsd: 0.25, bridgeFeeBps: 10, estTimeMin: 4,
    supports: (f, t, type) => type === 'cross-chain' && isEvm(f.chain) && isEvm(t.chain) },

  // FixedFloat: privacy-friendly instant swap; great for LN & XMR
  { id: 'fixedfloat', name: 'FixedFloat', type: 'privacy',
    buildUrl: (f, t) => `https://fixedfloat.com/?from=${f.symbol.toUpperCase()}&to=${t.symbol.toUpperCase()}`,
    edge: 0.0006, feeBps: 20, extraGasUsd: 0.4, bridgeFeeBps: 20, estTimeMin: 10,
    supports: (_f, _t, type) => type === 'cross-chain' },

  // ChangeNOW: instant non-custodial (BTC/XMR/EVM)
  { id: 'changenow', name: 'ChangeNOW', type: 'privacy',
    buildUrl: (f, t, a) => `https://changenow.io/?from=${f.symbol.toLowerCase()}&to=${t.symbol.toLowerCase()}&amount=${a}`,
    edge: 0.0005, feeBps: 22, extraGasUsd: 0.4, bridgeFeeBps: 22, estTimeMin: 12,
    supports: (_f, _t, type) => type === 'cross-chain' },

  // SideShift: instant swap with LN/BTC/SOL/XMR support
  { id: 'sideshift', name: 'SideShift.ai', type: 'privacy',
    buildUrl: (f, t) => `https://sideshift.ai/${f.symbol.toLowerCase()}/${t.symbol.toLowerCase()}`,
    edge: 0.0007, feeBps: 20, extraGasUsd: 0.3, bridgeFeeBps: 18, estTimeMin: 8,
    supports: (_f, _t, type) => type === 'cross-chain' },

  // Maya Protocol: native cross-chain liquidity (BTC/ETH/AVAX)
  { id: 'maya', name: 'Maya Protocol', type: 'bridge',
    buildUrl: () => `https://app.mayaprotocol.com/`,
    edge: 0.0009, feeBps: 12, extraGasUsd: 0.5, bridgeFeeBps: 16, estTimeMin: 9,
    supports: (f, t, type) => type === 'cross-chain'
      && !isPrivacy(f.chain) && !isPrivacy(t.chain)
      && f.chain !== 'solana' && t.chain !== 'solana'
      && (['bitcoin', 'ethereum', 'avalanche'].includes(f.chain) || ['bitcoin', 'ethereum', 'avalanche'].includes(t.chain)) },

  // Boltz: trustless Submarine Swaps — gold standard for Lightning <-> on-chain (incl. Polygon stables).
  { id: 'boltz', name: 'Boltz.exchange', type: 'privacy',
    buildUrl: () => `https://boltz.exchange/`,
    edge: 0.0012, feeBps: 50, extraGasUsd: 0.2, bridgeFeeBps: 0, estTimeMin: 5,
    // Lightning-centric cross-chain routes only.
    supports: (f, t, type) => type === 'cross-chain' && (f.chain === 'lightning' || t.chain === 'lightning') },

  // Exolix: fixed-rate instant swap desk — rate locked before execution, simulates 0% impact.
  { id: 'exolix', name: 'Exolix', type: 'privacy',
    buildUrl: (f, t, a) => `https://exolix.com/?coin_from=${f.symbol.toUpperCase()}&coin_to=${t.symbol.toUpperCase()}&amount=${a}`,
    edge: 0.0009, feeBps: 70, extraGasUsd: 0.3, bridgeFeeBps: 0, estTimeMin: 10,
    supports: (_f, _t, type) => type === 'cross-chain' },
];


function chainQuery(c: ChainId): string {
  switch (c) {
    case 'base': return '8453';
    case 'ethereum': return '1';
    case 'arbitrum': return '42161';
    case 'polygon': return '137';
    case 'avalanche': return '43114';
    case 'solana': return '1151111081099710';
    case 'bitcoin': return 'btc';
    case 'lightning': return 'ln';
    case 'monero': return 'xmr';
  }
}
function chainNumericId(c: ChainId): string {
  switch (c) {
    case 'base': return '8453';
    case 'ethereum': return '1';
    case 'arbitrum': return '42161';
    case 'polygon': return '137';
    case 'avalanche': return '43114';
    default: return '1';
  }
}

// ============= Quotes =============
export type PriceImpactLevel = 'ok' | 'warn' | 'unsafe';

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
  // Safety metrics
  priceImpactPct: number;     // simulated price impact (%)
  priceImpactUsd: number;     // USD value lost to price impact at current trade size
  slippageBufferUsd: number;  // worst-case USD lost to 0.5% slippage tolerance
  slippagePct: number;        // = MAX_SLIPPAGE_PCT, exposed for UI consistency
  impactLevel: PriceImpactLevel;
  rankValue: number;          // final ranking score (see formula in getQuotes)
  isBest?: boolean;
  supported: boolean;
  prioritized?: boolean;
  // Submarine swap / fixed-rate metadata (Lightning <-> Polygon stables routes).
  submarine?: boolean;   // route uses internal liquidity / submarine swap (no AMM impact)
  fixedRate?: boolean;   // rate is locked before execution → "Guaranteed Fixed Rate"
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
  privacyRoute: boolean;
}

export function getQuotes({ from, to, amount, prices, freshnessTick = 0 }: QuoteParams): QuoteResult {
  const swapType = detectSwapType(from, to);
  const privacyRoute = involvesPrivacy(from, to);
  const submarineRoute = isSubmarineRoute(from, to);
  if (!amount || amount <= 0 || !prices) return { swapType, quotes: [], best: null, privacyRoute };

  const fromUsd = tokenUsdPrice(from, prices);
  const toUsd = tokenUsdPrice(to, prices);
  if (fromUsd <= 0 || toUsd <= 0) return { swapType, quotes: [], best: null, privacyRoute };

  const grossInUsd = amount * fromUsd;
  const baseOut = grossInUsd / toUsd;

  const chainGas = CHAINS[from.chain].gasUsd + (swapType === 'cross-chain' ? CHAINS[to.chain].gasUsd : 0);
  const solInvolved = involvesSolana(from, to);
  const evmCross = swapType === 'cross-chain' && isEvm(from.chain) && isEvm(to.chain);

  const all: Quote[] = PLATFORMS.map(p => {
    const supported = p.supports(from, to, swapType);
    const seed = `${p.id}:${from.chain}:${from.symbol}:${to.chain}:${to.symbol}:${freshnessTick}`;
    const variance = seededVariance(seed);

    let priorityEdge = 0;
    let prioritized = false;

    if (submarineRoute) {
      // LN <-> Polygon stables: Boltz & FixedFloat & Exolix fixed-rate desks dominate.
      if (['boltz', 'fixedfloat'].includes(p.id)) {
        priorityEdge = 0.0060; prioritized = true;
      } else if (p.id === 'exolix') {
        priorityEdge = 0.0050; prioritized = true;
      } else if (['sideshift', 'changenow', 'houdini', 'trocador', 'swapspace'].includes(p.id)) {
        priorityEdge = 0.0030; prioritized = true;
      }
    } else if (privacyRoute) {
      // LN / XMR: only privacy aggregators should win.
      if (['boltz', 'exolix', 'fixedfloat', 'sideshift', 'changenow', 'houdini', 'trocador', 'swapspace'].includes(p.id)) {
        priorityEdge = 0.0035; prioritized = true;
      }
    } else if (involvesBitcoin(from, to) && swapType === 'cross-chain') {
      // Native BTC <-> ETH/AVAX/SOL/EVM: THORSwap & Maya at the top, plus deBridge & Jumper.
      if (['thorswap', 'maya'].includes(p.id)) {
        priorityEdge = 0.0018; prioritized = true;
      } else if (['debridge', 'jumper'].includes(p.id)) {
        priorityEdge = 0.0014; prioritized = true;
      }
    } else if (solInvolved) {
      if (p.id === 'jupiter') { priorityEdge = 0.0025; prioritized = true; }
      else if (p.id === 'jumper' || p.id === 'debridge') { priorityEdge = 0.0008; prioritized = true; }
    } else if (evmCross) {
      // LI.FI-style: Jumper, Across, deBridge, Bungee to the top for EVM<->EVM bridging.
      if (['jumper', 'across', 'debridge', 'bungee'].includes(p.id)) {
        priorityEdge = 0.0014; prioritized = true;
      } else if (['symbiosis', 'velora'].includes(p.id)) {
        priorityEdge = 0.0006; prioritized = true;
      }
    } else if (swapType === 'same-chain' && isEvm(from.chain)) {
      // 1inch, Odos, ParaSwap heavily optimized for same-chain EVM.
      if (['1inch', 'odos', 'paraswap'].includes(p.id)) {
        priorityEdge = 0.0012; prioritized = true;
      } else if (['matcha', 'cowswap', 'kyberswap', 'openocean'].includes(p.id)) {
        priorityEdge = 0.0006; prioritized = true;
      }
    } else if (swapType === 'cross-chain') {
      if (['jumper', 'symbiosis', 'trocador', 'houdini', 'swapspace'].includes(p.id)) {
        priorityEdge = 0.0006; prioritized = true;
      }
    }


    const edgeAdj = p.edge + priorityEdge + variance * 0.0020;
    const feeBpsAdj = Math.max(0, p.feeBps + (variance > 0 ? variance * 4 : variance * 1));

    const grossOut = baseOut * (1 + edgeAdj);

    // ---- Submarine swap / fixed-rate override (LN <-> Polygon stables) ----
    // Boltz, Exolix, FixedFloat & friends route through direct internal liquidity
    // (submarine swaps / OTC desks), so the generic AMM impact + bps fee math
    // does not apply. We replace it with a flat processing fee (0.5–1%) and a
    // hard-capped near-zero price impact (0.05–0.2%).
    const isSubmarineProvider =
      submarineRoute && supported && SUBMARINE_PROVIDERS.includes(p.id);
    const isFixedRateProvider =
      isSubmarineProvider && FIXED_RATE_PROVIDERS.includes(p.id);

    let protocolFeeUsd: number;
    let bridgeFeeUsd: number;
    let priceImpactPct: number;

    if (isSubmarineProvider) {
      // Flat processing fee 0.5–1.0% (fixed-rate desks at the low end).
      const baseFeePct = isFixedRateProvider ? 0.5 : 0.7;
      const feePct = baseFeePct + ((variance + 1) / 2) * 0.5; // 0.5..1.0 / 0.7..1.2
      const clampedFeePct = Math.min(1.0, Math.max(0.5, feePct));
      protocolFeeUsd = (grossInUsd * clampedFeePct) / 100;
      bridgeFeeUsd = 0;
      // Near-zero impact: fixed-rate desks 0.05–0.10%, others 0.10–0.20%.
      const impactBase = isFixedRateProvider ? 0.05 : 0.10;
      const impactSpread = isFixedRateProvider ? 0.05 : 0.10;
      priceImpactPct = impactBase + ((variance + 1) / 2) * impactSpread;
    } else {
      protocolFeeUsd = (grossOut * toUsd) * (feeBpsAdj / 10000);
      bridgeFeeUsd = swapType === 'cross-chain' && p.bridgeFeeBps
        ? (grossOut * toUsd) * (p.bridgeFeeBps / 10000)
        : 0;
      // ---- Price impact simulation (AMM) ----
      const liquidityUsd = p.liquidityUsd ?? DEFAULT_LIQUIDITY_USD[p.type];
      const rawImpactPct = (grossInUsd / liquidityUsd) * 100 + variance * 0.15;
      priceImpactPct = Math.max(0, rawImpactPct);
    }
    const priceImpactUsd = (grossInUsd * priceImpactPct) / 100;

    const gasUsd = chainGas + p.extraGasUsd * (1 + variance * 0.2);

    // ---- Slippage buffer (hard-locked 0.5%) ----
    // Submarine / fixed-rate routes have no slippage — the rate is locked.
    const slippageBufferUsd = isSubmarineProvider
      ? 0
      : (grossInUsd * MAX_SLIPPAGE_PCT) / 100;

    const totalCostUsd = protocolFeeUsd + bridgeFeeUsd + gasUsd;
    const grossOutUsdValue = grossOut * toUsd;
    // Net output reflects ALL friction points (fees + impact + slippage buffer).
    const netOutUsd = Math.max(0, grossOutUsdValue - totalCostUsd - priceImpactUsd - slippageBufferUsd);
    const netOut = netOutUsd / toUsd;
    const estTimeMin = Math.max(0.5, p.estTimeMin * (1 + variance * 0.15));

    // Submarine / fixed-rate routes always render as safe (green).
    const impactLevel: PriceImpactLevel =
      isSubmarineProvider ? 'ok'
      : priceImpactPct >= PRICE_IMPACT_UNSAFE_PCT ? 'unsafe'
      : priceImpactPct >= PRICE_IMPACT_WARN_PCT ? 'warn'
      : 'ok';

    // Ultimate ranking value — exactly the formula from the spec.
    // Higher = better. Time penalty only matters for cross-chain.
    const timePenaltyUsd = swapType === 'cross-chain' ? estTimeMin * 0.02 : 0;
    const rankValue = netOutUsd - timePenaltyUsd;

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
      priceImpactPct,
      priceImpactUsd,
      slippageBufferUsd,
      slippagePct: isSubmarineProvider ? 0 : MAX_SLIPPAGE_PCT,
      impactLevel,
      rankValue,
      supported,
      prioritized,
      submarine: isSubmarineProvider,
      fixedRate: isFixedRateProvider,
    };
  });

  // Sort: supported first; within supported, unsafe-impact routes pushed
  // to the bottom; otherwise highest rankValue (= max net output after all friction) wins.
  const sorted = all.sort((a, b) => {
    if (a.supported !== b.supported) return a.supported ? -1 : 1;
    const aUnsafe = a.impactLevel === 'unsafe' ? 1 : 0;
    const bUnsafe = b.impactLevel === 'unsafe' ? 1 : 0;
    if (aUnsafe !== bUnsafe) return aUnsafe - bUnsafe;
    return b.rankValue - a.rankValue;
  });


  const best =
    sorted.find(q => q.supported && q.impactLevel !== 'unsafe') ??
    sorted.find(q => q.supported) ??
    null;
  if (best) best.isBest = true;
  return { swapType, quotes: sorted, best, privacyRoute };
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
