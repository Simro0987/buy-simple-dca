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
  priceRef: 'usd' | 'btc' | 'eth' | 'sol' | 'avax' | 'pol' | 'xmr' | 'arb' | 'op' | 'bnb' | 'sui';
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
  { symbol: 'wstETH',      name: 'Wrapped stETH',               chain: 'ethereum',  priceRef: 'eth', multiplier: 1.18, decimals: 18 },
  { symbol: 'weETH',       name: 'Ether.fi Wrapped eETH',       chain: 'ethereum',  priceRef: 'eth', multiplier: 1.045, decimals: 18 },
  // Base Network
  { symbol: 'USDC',        name: 'USD Coin',                    chain: 'base',      priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT',        name: 'Tether',                      chain: 'base',      priceRef: 'usd', decimals: 6 },
  { symbol: 'cbBTC',       name: 'Coinbase Wrapped BTC',        chain: 'base',      priceRef: 'btc', decimals: 8 },
  { symbol: 'WETH',        name: 'Wrapped Ether',               chain: 'base',      priceRef: 'eth', decimals: 18 },
  { symbol: 'ETH',         name: 'Ether (Base Native Bridged)', chain: 'base',      priceRef: 'eth', decimals: 18, native: true },
  { symbol: 'SOL',         name: 'Wormhole SOL',                chain: 'base',      priceRef: 'sol', decimals: 9 },
  // Arbitrum
  { symbol: 'ETH',         name: 'Ether (Arbitrum Native)',     chain: 'arbitrum',  priceRef: 'eth', decimals: 18, native: true },
  { symbol: 'USDC',        name: 'USD Coin',                    chain: 'arbitrum',  priceRef: 'usd', decimals: 6 },
  { symbol: 'USDT',        name: 'Tether',                      chain: 'arbitrum',  priceRef: 'usd', decimals: 6 },
  { symbol: 'wBTC',        name: 'Wrapped BTC',                 chain: 'arbitrum',  priceRef: 'btc', decimals: 8 },
  { symbol: 'wstETH',      name: 'Wrapped stETH',               chain: 'arbitrum',  priceRef: 'eth', multiplier: 1.18, decimals: 18 },
  { symbol: 'weETH',       name: 'Ether.fi Wrapped eETH',       chain: 'arbitrum',  priceRef: 'eth', multiplier: 1.045, decimals: 18 },
  { symbol: 'ARB',         name: 'Arbitrum (Governance)',       chain: 'arbitrum',  priceRef: 'arb', decimals: 18 },
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
// Tuned to current realistic spot ranges so a missing oracle never displays a
// stale or obviously wrong number (e.g. legacy MATIC ~$0.47).
const FALLBACK_USD: Record<string, number> = {
  pol:  0.20,
  avax: 22,
  xmr:  340,
  arb:  0.30,
  op:   0.45,
  bnb:  600,
  sui:  3.5,
};

export function tokenUsdPrice(t: TokenMeta, prices: PriceData | undefined): number {
  const m = t.multiplier ?? 1;
  if (!prices) {
    if (t.priceRef === 'usd') return 1 * m;
    return (FALLBACK_USD[t.priceRef] ?? 0) * m;
  }
  const p = prices as unknown as Record<string, { usd?: number } | undefined>;
  switch (t.priceRef) {
    case 'usd':  return 1 * m;
    case 'btc':  return (p['bitcoin']?.usd ?? 0) * m;
    case 'eth':  return (p['ethereum']?.usd ?? 0) * m;
    case 'sol':  return (p['solana']?.usd ?? 0) * m;
    case 'avax': return (p['avalanche-2']?.usd ?? FALLBACK_USD.avax) * m;
    // POL: prefer the post-migration polygon-ecosystem-token id (the live POL
    // contract). matic-network is kept ONLY as a defensive fallback because
    // some CoinGecko mirrors still lag and would otherwise display the legacy
    // ~$0.47 MATIC quote instead of the real POL price.
    case 'pol':  return (p['polygon-ecosystem-token']?.usd ?? p['matic-network']?.usd ?? FALLBACK_USD.pol) * m;
    case 'xmr':  return (p['monero']?.usd ?? FALLBACK_USD.xmr) * m;
    case 'arb':  return (p['arbitrum']?.usd ?? FALLBACK_USD.arb) * m;
    case 'op':   return (p['optimism']?.usd ?? FALLBACK_USD.op) * m;
    case 'bnb':  return (p['binancecoin']?.usd ?? FALLBACK_USD.bnb) * m;
    case 'sui':  return (p['sui']?.usd ?? FALLBACK_USD.sui) * m;
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
  'boltz', 'exolix', 'fixedfloat', 'sideshift', 'changenow', 'houdini', 'trocador', 'swapspace', 'stealthex',
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
  liquidityUsd?: number;
  supports: (from: TokenMeta, to: TokenMeta, type: SwapType) => boolean;
  // ===== Capability flags (used by Pro-Filter Suite) =====
  customRecipient?: boolean;   // App lets user pick a different destination wallet
  noKyc?: boolean;             // No registration / no KYC walls
  noWallet?: boolean;          // Deposit-address based, no Web3 wallet connection
  mevProtected?: boolean;      // Private RPC / batch auctions / intent architecture
  offchainGasless?: boolean;   // EIP-712 signature-based, gasless limit orders
  limitOrders?: boolean;       // Native limit-order protocol support
  gasRefuel?: boolean;         // Can deliver native gas on destination chain
  // ===== Protocol health =====
  health?: 'ok' | 'congested' | 'degraded' | 'security_risk' | 'paused';
  healthNote?: string;         // Short alert reason for UI
  // ===== Anti-phishing =====
  // Hardcoded verified official domain. Always rendered in the UI and used
  // as the destination for the "Go to Platform" button. Never load any URL
  // outside this domain to prevent search-ad / phishing hijacks.
  officialUrl?: string;
}

// Health rank used for ranking penalty (higher = worse).
const HEALTH_PENALTY: Record<NonNullable<Platform['health']>, number> = {
  ok: 0,
  congested: 0.15,
  degraded: 0.35,
  security_risk: 0.80,
  paused: 1.00,
};

// Default liquidity tiers used when a platform doesn't override liquidityUsd.
const DEFAULT_LIQUIDITY_USD: Record<Platform['type'], number> = {
  aggregator: 80_000_000,
  dex:        45_000_000,
  bridge:     25_000_000,
  privacy:    1_200_000,
};

const EVM_CHAINS: ChainId[] = ['ethereum', 'base', 'arbitrum', 'polygon', 'avalanche'];
const isEvm = (c: ChainId) => EVM_CHAINS.includes(c);
const isPrivacy = (c: ChainId) => PRIVACY_CHAINS.includes(c);

// L2-to-L2 chains (Orbiter sweet spot).
const L2_CHAINS: ChainId[] = ['base', 'arbitrum', 'polygon'];
const isL2 = (c: ChainId) => L2_CHAINS.includes(c);

export const PLATFORMS: Platform[] = [
  // ===== LI.FI universal aggregator =====
  { id: 'jumper', name: 'Jumper.xyz', type: 'aggregator',
    buildUrl: (f, t, a) => `https://jumper.exchange/?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&fromToken=${encodeURIComponent(f.symbol)}&toToken=${encodeURIComponent(t.symbol)}&fromAmount=${a}`,
    edge: 0.0015, feeBps: 5, extraGasUsd: 0.0, bridgeFeeBps: 8, estTimeMin: 3,
    supports: (f, t) => !isPrivacy(f.chain) && !isPrivacy(t.chain),
    customRecipient: true, mevProtected: true, gasRefuel: true },

  // ===== Same-chain EVM aggregators =====
  { id: 'odos', name: 'Odos.xyz', type: 'aggregator',
    buildUrl: (f, t) => `https://app.odos.xyz/?inputCurrency=${f.symbol}&outputCurrency=${t.symbol}&chainId=${chainNumericId(f.chain)}`,
    edge: 0.0017, feeBps: 5, extraGasUsd: 0.0, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain),
    mevProtected: true, limitOrders: true },
  { id: 'paraswap', name: 'ParaSwap', type: 'aggregator',
    buildUrl: (f, t) => `https://app.paraswap.io/#/${f.symbol}-${t.symbol}/SELL?network=${chainQuery(f.chain)}`,
    edge: 0.0011, feeBps: 6, extraGasUsd: 0.02, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain),
    mevProtected: true, offchainGasless: true, limitOrders: true },
  { id: 'cowswap', name: 'CoW Swap', type: 'dex',
    buildUrl: (f, t) => `https://swap.cow.fi/#/${chainNumericId(f.chain)}/swap/${f.symbol}/${t.symbol}`,
    edge: 0.0019, feeBps: 3, extraGasUsd: 0.0, estTimeMin: 3,
    supports: (f, t, type) => type === 'same-chain' && ['ethereum', 'arbitrum', 'base', 'polygon'].includes(f.chain),
    mevProtected: true, offchainGasless: true, limitOrders: true },
  { id: 'matcha', name: 'Matcha.xyz', type: 'aggregator',
    buildUrl: (f, t) => `https://matcha.xyz/markets/${chainNumericId(f.chain)}/${f.symbol}`,
    edge: 0.0013, feeBps: 6, extraGasUsd: 0.03, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain),
    offchainGasless: true, limitOrders: true },
  { id: 'kyberswap', name: 'KyberSwap', type: 'aggregator',
    buildUrl: (f, t) => `https://kyberswap.com/swap/${chainQuery(f.chain)}/${f.symbol}-to-${t.symbol}`,
    edge: 0.0010, feeBps: 7, extraGasUsd: 0.04, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && isEvm(f.chain),
    limitOrders: true },

  // ===== Solana =====
  { id: 'jupiter', name: 'Jupiter AG', type: 'aggregator',
    buildUrl: (f, t, a) => `https://jup.ag/swap/${f.symbol}-${t.symbol}?amount=${a}`,
    edge: 0.0028, feeBps: 4, extraGasUsd: 0.0, estTimeMin: 1,
    supports: (f, t) => f.chain === 'solana' && t.chain === 'solana',
    limitOrders: true },

  // ===== Cross-chain bridges / aggregators (EVM-focused) =====
  { id: 'across', name: 'Across Protocol', type: 'bridge',
    buildUrl: (f, t, a) => `https://app.across.to/bridge?fromChain=${chainQuery(f.chain)}&toChain=${chainQuery(t.chain)}&inputToken=${f.symbol}&outputToken=${t.symbol}&inputAmount=${a}`,
    edge: 0.0008, feeBps: 4, extraGasUsd: 0.3, bridgeFeeBps: 6, estTimeMin: 2,
    supports: (f, t, type) => type === 'cross-chain'
      && ['ethereum', 'base', 'arbitrum', 'polygon'].includes(f.chain)
      && ['ethereum', 'base', 'arbitrum', 'polygon'].includes(t.chain),
    customRecipient: true },
  { id: 'symbiosis', name: 'Symbiosis Finance', type: 'bridge',
    buildUrl: () => `https://app.symbiosis.finance/swap`,
    edge: 0.0006, feeBps: 8, extraGasUsd: 0.6, bridgeFeeBps: 14, estTimeMin: 6,
    supports: (f, t, type) => type === 'cross-chain' && !isPrivacy(f.chain) && !isPrivacy(t.chain),
    customRecipient: true },
  { id: 'debridge', name: 'deBridge.com', type: 'bridge',
    buildUrl: () => `https://app.debridge.finance/`,
    edge: 0.0007, feeBps: 6, extraGasUsd: 0.4, bridgeFeeBps: 12, estTimeMin: 4,
    supports: (f, t, type) => type === 'cross-chain' && !involvesBitcoin(f, t) && !isPrivacy(f.chain) && !isPrivacy(t.chain),
    customRecipient: true },
  { id: 'velora', name: 'Velora.xyz', type: 'aggregator',
    buildUrl: () => `https://velora.xyz/`,
    edge: 0.0009, feeBps: 8, extraGasUsd: 0.05, bridgeFeeBps: 10, estTimeMin: 5,
    supports: (f, t, type) => type === 'cross-chain' && !involvesBitcoin(f, t) && !isPrivacy(f.chain) && !isPrivacy(t.chain) },

  // ===== Privacy / instant cross-chain =====
  { id: 'trocador', name: 'Trocador.app', type: 'privacy',
    buildUrl: (f, t, a) => `https://trocador.app/en/?ticker_from=${f.symbol.toLowerCase()}&ticker_to=${t.symbol.toLowerCase()}&network_from=${f.chain}&network_to=${t.chain}&amount=${a}`,
    edge: 0.0004, feeBps: 25, extraGasUsd: 0.8, bridgeFeeBps: 30, estTimeMin: 15,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },
  { id: 'houdini', name: 'Houdiniswap.com', type: 'privacy',
    buildUrl: () => `https://houdiniswap.com/`,
    edge: 0.0002, feeBps: 30, extraGasUsd: 1.0, bridgeFeeBps: 40, estTimeMin: 20,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },
  { id: 'swapspace', name: 'Swapspace.co', type: 'aggregator',
    buildUrl: (f, t) => `https://swapspace.co/exchange/${f.symbol.toLowerCase()}/${t.symbol.toLowerCase()}`,
    edge: 0.0005, feeBps: 25, extraGasUsd: 0.5, bridgeFeeBps: 25, estTimeMin: 12,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },

  // ===== Premium integrations =====
  { id: 'thorswap', name: 'THORSwap', type: 'bridge',
    buildUrl: (f, t) => `https://app.thorswap.finance/swap?input=${f.chain}.${f.symbol}&output=${t.chain}.${t.symbol}`,
    edge: 0.0010, feeBps: 10, extraGasUsd: 0.5, bridgeFeeBps: 15, estTimeMin: 8,
    supports: (f, t, type) => type === 'cross-chain'
      && !isPrivacy(f.chain) && !isPrivacy(t.chain)
      && f.chain !== 'solana' && t.chain !== 'solana'
      && (['bitcoin', 'ethereum', 'avalanche'].includes(f.chain) || ['bitcoin', 'ethereum', 'avalanche'].includes(t.chain)),
    customRecipient: true },
  { id: '1inch', name: '1inch', type: 'aggregator',
    buildUrl: (f, t) => `https://app.1inch.io/#/${chainNumericId(f.chain)}/simple/swap/${f.symbol}/${t.symbol}`,
    edge: 0.0018, feeBps: 4, extraGasUsd: 0.0, estTimeMin: 1,
    supports: (f, _t, type) => type === 'same-chain' && isEvm(f.chain),
    mevProtected: true, offchainGasless: true, limitOrders: true },
  { id: 'openocean', name: 'OpenOcean', type: 'aggregator',
    buildUrl: (f, t) => `https://app.openocean.finance/classic#/${(CHAINS[f.chain].short || '').toUpperCase()}/${f.symbol}/${t.symbol}`,
    edge: 0.0012, feeBps: 6, extraGasUsd: 0.03, estTimeMin: 1,
    supports: (f, t, type) => type === 'same-chain' && (isEvm(f.chain) || f.chain === 'solana'),
    limitOrders: true },
  { id: 'bungee', name: 'Bungee.exchange', type: 'bridge',
    buildUrl: (f, t, a) => `https://www.bungee.exchange/?fromChainId=${chainNumericId(f.chain)}&toChainId=${chainNumericId(t.chain)}&fromTokenSymbol=${f.symbol}&toTokenSymbol=${t.symbol}&amount=${a}`,
    edge: 0.0009, feeBps: 5, extraGasUsd: 0.25, bridgeFeeBps: 10, estTimeMin: 4,
    supports: (f, t, type) => type === 'cross-chain' && isEvm(f.chain) && isEvm(t.chain),
    customRecipient: true, mevProtected: true, gasRefuel: true },
  { id: 'fixedfloat', name: 'ff.io', type: 'privacy',
    buildUrl: (f, t) => `https://ff.io/?type=fixed&from=${f.symbol.toUpperCase()}&to=${t.symbol.toUpperCase()}`,
    edge: 0.0006, feeBps: 20, extraGasUsd: 0.4, bridgeFeeBps: 20, estTimeMin: 10,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },
  { id: 'changenow', name: 'ChangeNOW', type: 'privacy',
    buildUrl: (f, t, a) => `https://changenow.io/?from=${f.symbol.toLowerCase()}&to=${t.symbol.toLowerCase()}&amount=${a}`,
    edge: 0.0005, feeBps: 22, extraGasUsd: 0.4, bridgeFeeBps: 22, estTimeMin: 12,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },
  { id: 'sideshift', name: 'SideShift.ai', type: 'privacy',
    buildUrl: (f, t) => `https://sideshift.ai/${f.symbol.toLowerCase()}/${t.symbol.toLowerCase()}`,
    edge: 0.0007, feeBps: 20, extraGasUsd: 0.3, bridgeFeeBps: 18, estTimeMin: 8,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },
  { id: 'stealthex', name: 'StealthEX', type: 'privacy',
    buildUrl: (f, t, a) => `https://stealthex.io/?from=${f.symbol.toLowerCase()}&to=${t.symbol.toLowerCase()}&amount=${a}`,
    edge: 0.0005, feeBps: 25, extraGasUsd: 0.4, bridgeFeeBps: 22, estTimeMin: 12,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },
  { id: 'maya', name: 'Maya Protocol', type: 'bridge',
    buildUrl: () => `https://app.mayaprotocol.com/`,
    edge: 0.0009, feeBps: 12, extraGasUsd: 0.5, bridgeFeeBps: 16, estTimeMin: 9,
    supports: (f, t, type) => type === 'cross-chain'
      && !isPrivacy(f.chain) && !isPrivacy(t.chain)
      && f.chain !== 'solana' && t.chain !== 'solana'
      && (['bitcoin', 'ethereum', 'avalanche'].includes(f.chain) || ['bitcoin', 'ethereum', 'avalanche'].includes(t.chain)),
    customRecipient: true },
  { id: 'boltz', name: 'Boltz.exchange', type: 'privacy',
    buildUrl: () => `https://boltz.exchange/`,
    edge: 0.0012, feeBps: 50, extraGasUsd: 0.2, bridgeFeeBps: 0, estTimeMin: 5,
    supports: (f, t, type) => type === 'cross-chain' && (f.chain === 'lightning' || t.chain === 'lightning'),
    customRecipient: true, noKyc: true, noWallet: true },
  { id: 'exolix', name: 'Exolix', type: 'privacy',
    buildUrl: (f, t, a) => `https://exolix.com/?coin_from=${f.symbol.toUpperCase()}&coin_to=${t.symbol.toUpperCase()}&amount=${a}`,
    edge: 0.0009, feeBps: 70, extraGasUsd: 0.3, bridgeFeeBps: 0, estTimeMin: 10,
    supports: (_f, _t, type) => type === 'cross-chain',
    customRecipient: true, noKyc: true, noWallet: true },

  // ===== L2-to-L2 + multi-chain newcomers =====
  // Orbiter Finance: ultra-fast L2 <-> L2 bridge (Base/Arb/Polygon/zkSync/Linea/etc.)
  { id: 'orbiter', name: 'Orbiter Finance', type: 'bridge',
    buildUrl: (f, t) => `https://www.orbiter.finance/?source=${chainQuery(f.chain)}&dest=${chainQuery(t.chain)}&token=${f.symbol}`,
    edge: 0.0014, feeBps: 4, extraGasUsd: 0.1, bridgeFeeBps: 5, estTimeMin: 1.5,
    supports: (f, t, type) => type === 'cross-chain' && isL2(f.chain) && isL2(t.chain),
    customRecipient: true },
  // Rubic Exchange: multi-chain aggregator for EVM + Solana
  { id: 'rubic', name: 'Rubic Exchange', type: 'aggregator',
    buildUrl: () => `https://app.rubic.exchange/`,
    edge: 0.0008, feeBps: 9, extraGasUsd: 0.3, bridgeFeeBps: 14, estTimeMin: 6,
    supports: (f, t, type) => type === 'cross-chain' && !isPrivacy(f.chain) && !isPrivacy(t.chain) && !involvesBitcoin(f, t),
    customRecipient: true },

  // ===== Verified cross-chain bridges (Custom Recipient support) =====
  { id: 'stargate', name: 'Stargate Finance', type: 'bridge',
    buildUrl: () => `https://stargate.finance/transfer`,
    edge: 0.0009, feeBps: 6, extraGasUsd: 0.35, bridgeFeeBps: 8, estTimeMin: 3,
    supports: (f, t, type) => type === 'cross-chain' && isEvm(f.chain) && isEvm(t.chain),
    customRecipient: true, gasRefuel: true },
  { id: 'squid', name: 'Squid Router', type: 'bridge',
    buildUrl: () => `https://app.squidrouter.com/`,
    edge: 0.0008, feeBps: 7, extraGasUsd: 0.30, bridgeFeeBps: 10, estTimeMin: 3.5,
    supports: (f, t, type) => type === 'cross-chain' && !isPrivacy(f.chain) && !isPrivacy(t.chain) && !involvesBitcoin(f, t),
    customRecipient: true, gasRefuel: true },
  { id: 'hop', name: 'Hop Protocol', type: 'bridge',
    buildUrl: () => `https://app.hop.exchange/#/send`,
    edge: 0.0007, feeBps: 5, extraGasUsd: 0.20, bridgeFeeBps: 9, estTimeMin: 4,
    supports: (f, t, type) => type === 'cross-chain' && isL2(f.chain) && isL2(t.chain),
    customRecipient: true },
  { id: 'synapse', name: 'Synapse Protocol', type: 'bridge',
    buildUrl: () => `https://synapseprotocol.com/`,
    edge: 0.0006, feeBps: 8, extraGasUsd: 0.40, bridgeFeeBps: 12, estTimeMin: 5,
    supports: (f, t, type) => type === 'cross-chain' && isEvm(f.chain) && isEvm(t.chain),
    customRecipient: true },
  { id: 'owlto', name: 'Owlto Finance', type: 'bridge',
    buildUrl: () => `https://owlto.finance/`,
    edge: 0.0012, feeBps: 4, extraGasUsd: 0.10, bridgeFeeBps: 6, estTimeMin: 1.5,
    supports: (f, t, type) => type === 'cross-chain' && isL2(f.chain) && isL2(t.chain),
    customRecipient: true },
  { id: 'dln', name: 'DLN / deBridge Intent', type: 'bridge',
    buildUrl: () => `https://app.dln.trade/`,
    edge: 0.0010, feeBps: 5, extraGasUsd: 0.25, bridgeFeeBps: 8, estTimeMin: 2.5,
    supports: (f, t, type) => type === 'cross-chain' && !isPrivacy(f.chain) && !isPrivacy(t.chain) && !involvesBitcoin(f, t),
    customRecipient: true, mevProtected: true, gasRefuel: true },
];

// ============= Anti-phishing: verified official domains =============
// Hardcoded mapping of platform id -> verified domain. Always rendered as
// "Verified: <domain>" and used to gate redirect targets.
const OFFICIAL_URLS: Record<string, string> = {
  jumper:     'jumper.xyz',
  velora:     'velora.xyz',
  paraswap:   'paraswap.io',
  across:     'across.to',
  jupiter:    'jup.ag',
  odos:       'odos.xyz',
  kyberswap:  'kyberswap.com',
  symbiosis:  'symbiosis.finance',
  cowswap:    'cow.fi',
  debridge:   'debridge.finance',
  matcha:     'matcha.xyz',
  trocador:   'trocador.app',
  houdini:    'houdiniswap.com',
  swapspace:  'swapspace.co',
  thorswap:   'thorswap.finance',
  '1inch':    '1inch.io',
  openocean:  'openocean.finance',
  bungee:     'bungee.exchange',
  fixedfloat: 'ff.io',
  changenow:  'changenow.io',
  sideshift:  'sideshift.ai',
  stealthex:  'stealthex.io',
  maya:       'mayaprotocol.com',
  orbiter:    'orbiter.finance',
  rubic:      'rubic.exchange',
  boltz:      'boltz.exchange',
  exolix:     'exolix.com',
  stargate:   'stargate.finance',
  squid:      'squidrouter.com',
  hop:        'hop.exchange',
  synapse:    'synapseprotocol.com',
  owlto:      'owlto.finance',
  dln:        'dln.trade',
};
for (const p of PLATFORMS) {
  p.officialUrl = OFFICIAL_URLS[p.id] ?? p.officialUrl;
}

// ============= Protocol Health overrides =============
// Live status flags surfaced as red badges in the UI. Tuned periodically
// based on public status pages / exploit history / pool pauses.
const HEALTH_OVERRIDES: Record<string, { health: NonNullable<Platform['health']>; note: string }> = {
  // Multichain (exploit history) — kept off list. Examples below are illustrative.
  symbiosis:  { health: 'congested',     note: 'Bridge congestion (slower fills)' },
  houdini:    { health: 'degraded',      note: 'Service degradation reported' },
  swapspace:  { health: 'congested',     note: 'Slower aggregator response' },
  rubic:      { health: 'degraded',      note: 'Occasional route failures' },
  velora:     { health: 'degraded',      note: 'Liquidity issues on minor pairs' },
  // Most other providers default to 'ok'.
};

// Apply overrides once at module load.
for (const p of PLATFORMS) {
  const o = HEALTH_OVERRIDES[p.id];
  if (o) { p.health = o.health; p.healthNote = o.note; }
  else { p.health = p.health ?? 'ok'; }
}

// ============= Order types & filters =============
export type OrderType = 'market' | 'limit';

export interface QuoteFilters {
  customRecipient?: boolean;   // Toggle 1
  noKyc?: boolean;             // Toggle 2 (Privacy Mode)
  noWallet?: boolean;          // Toggle 3
  mevProtected?: boolean;      // Toggle 4
  offchainGasless?: boolean;   // Limit-mode "Off-chain only"
  healthyOnly?: boolean;       // Toggle 6 — hide congested/degraded/exploited
}

// Chains that natively support limit orders (smart-contract chains only).
const LIMIT_ORDER_CHAINS: ChainId[] = ['ethereum', 'base', 'arbitrum', 'polygon', 'avalanche', 'solana'];
export const isLimitOrderChain = (c: ChainId) => LIMIT_ORDER_CHAINS.includes(c);

// Native gas-token symbol per chain (used for "Gas Refuel" warning).
export function getGasTokenSymbol(c: ChainId): string {
  switch (c) {
    case 'ethereum':
    case 'base':
    case 'arbitrum':   return 'ETH';
    case 'polygon':    return 'POL';
    case 'avalanche':  return 'AVAX';
    case 'solana':     return 'SOL';
    case 'bitcoin':    return 'BTC';
    case 'lightning':  return 'sats';
    case 'monero':     return 'XMR';
  }
}

// True when delivering `to` likely requires native gas the user may lack.
// Skip when destination is BTC/LN/XMR (no separate gas) or the swap delivers
// the native gas token itself.
export function needsGasRefuel(to: TokenMeta): boolean {
  if (['bitcoin', 'lightning', 'monero'].includes(to.chain)) return false;
  const gas = getGasTokenSymbol(to.chain);
  return to.symbol.toUpperCase() !== gas.toUpperCase();
}


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
  submarine?: boolean;
  fixedRate?: boolean;
  // Capability flags surfaced for UI badges (mirrors Platform).
  customRecipient?: boolean;
  noKyc?: boolean;
  noWallet?: boolean;
  mevProtected?: boolean;
  offchainGasless?: boolean;
  limitOrders?: boolean;
  gasRefuel?: boolean;
  // When `supported = false`, this explains why ("Requires Wallet Connection", etc.).
  unsupportedReason?: string;
  // USD saved versus the median supported alternative (only on #1).
  savedVsMedianUsd?: number;
  // Protocol health surfaced from Platform.
  health: NonNullable<Platform['health']>;
  healthNote?: string;
  // Live cross-verification: how far the simulated rate deviates from the
  // oracle baseline (LI.FI / Jupiter style). Flag when |deviation| > 2%.
  priceVariancePct: number;
  priceVarianceFlag: boolean;
  // Stronger oracle deviation flag (>5%) — used by the "⚠️ Odchýlka kurzu" badge.
  oracleDeviationFlag: boolean;
  // Explicit hop chain for the multi-hop route visualizer.
  hops: RouteHop[];
  // Anti-phishing: verified official domain (e.g. "boltz.exchange").
  officialUrl: string;
}

export interface RouteHop {
  kind: 'asset' | 'protocol';
  label: string;       // e.g. "USDC" or "Across Protocol"
  sub?: string;        // e.g. chain short name "BASE"
  icon?: string;
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
  orderType?: OrderType;
  filters?: QuoteFilters;
}

export interface QuoteResult {
  swapType: SwapType;
  quotes: Quote[];
  best: Quote | null;
  privacyRoute: boolean;
  submarineRoute: boolean;
  orderType: OrderType;
}

export function getQuotes(params: QuoteParams): QuoteResult {
  const { from, to, amount, prices, freshnessTick = 0 } = params;
  const orderType: OrderType = params.orderType ?? 'market';
  const filters: QuoteFilters = params.filters ?? {};
  const swapType = detectSwapType(from, to);
  const privacyRoute = involvesPrivacy(from, to);
  const submarineRoute = isSubmarineRoute(from, to);
  const empty: QuoteResult = { swapType, quotes: [], best: null, privacyRoute, submarineRoute, orderType };
  if (!amount || amount <= 0 || !prices) return empty;

  const fromUsd = tokenUsdPrice(from, prices);
  const toUsd = tokenUsdPrice(to, prices);
  if (fromUsd <= 0 || toUsd <= 0) return empty;

  const grossInUsd = amount * fromUsd;
  const baseOut = grossInUsd / toUsd;

  const chainGas = CHAINS[from.chain].gasUsd + (swapType === 'cross-chain' ? CHAINS[to.chain].gasUsd : 0);
  const solInvolved = involvesSolana(from, to);
  const evmCross = swapType === 'cross-chain' && isEvm(from.chain) && isEvm(to.chain);

  const all: Quote[] = PLATFORMS.map(p => {
    // ---- Baseline support + order-type + filter gating ----
    let supported = p.supports(from, to, swapType);
    let unsupportedReason: string | undefined;

    if (!supported) {
      unsupportedReason = 'Not Supported for this route';
    } else if (orderType === 'limit') {
      // Limit orders require a smart-contract chain AND native limit-order support.
      if (!isLimitOrderChain(from.chain) || !isLimitOrderChain(to.chain)) {
        supported = false; unsupportedReason = 'Limit orders require smart-contract chains';
      } else if (!p.limitOrders) {
        supported = false; unsupportedReason = 'No limit-order protocol';
      } else if (filters.offchainGasless && !p.offchainGasless) {
        supported = false; unsupportedReason = 'Requires On-chain Lock/Gas';
      }
    }
    if (supported) {
      if (filters.customRecipient && !p.customRecipient) {
        supported = false; unsupportedReason = 'Requires Same Wallet';
      } else if (filters.noKyc && !p.noKyc) {
        supported = false; unsupportedReason = 'KYC Risk / Registration Required';
      } else if (filters.noWallet && !p.noWallet) {
        supported = false; unsupportedReason = 'Requires Wallet Connection';
      } else if (filters.mevProtected && !p.mevProtected) {
        supported = false; unsupportedReason = 'No MEV protection (sandwich risk)';
      } else if (filters.healthyOnly && p.health && p.health !== 'ok') {
        supported = false; unsupportedReason = `Protocol Alert: ${p.healthNote ?? p.health}`;
      }
    }

    const seed = `${p.id}:${from.chain}:${from.symbol}:${to.chain}:${to.symbol}:${orderType}:${freshnessTick}`;
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
      // L2 <-> L2: Orbiter is the fast-path king.
      if (p.id === 'orbiter' && isL2(from.chain) && isL2(to.chain)) {
        priorityEdge = 0.0020; prioritized = true;
      } else if (['jumper', 'across', 'debridge', 'bungee'].includes(p.id)) {
        priorityEdge = 0.0014; prioritized = true;
      } else if (['symbiosis', 'velora', 'rubic'].includes(p.id)) {
        priorityEdge = 0.0006; prioritized = true;
      }
    } else if (swapType === 'same-chain' && isEvm(from.chain)) {
      // 1inch, Odos, ParaSwap heavily optimized for same-chain EVM.
      if (['1inch', 'odos', 'paraswap'].includes(p.id)) {
        priorityEdge = 0.0012; prioritized = true;
      } else if (['matcha', 'cowswap', 'kyberswap', 'openocean'].includes(p.id)) {
        priorityEdge = 0.0006; prioritized = true;
      }
      // Ethereum mainnet + MEV-protection toggle ⇒ heavily boost CoW & 1inch Fusion.
      if (from.chain === 'ethereum' && filters.mevProtected && ['cowswap', '1inch'].includes(p.id)) {
        priorityEdge += 0.0020; prioritized = true;
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

    // ---- Cross-verification vs oracle baseline ----
    // Simulate LI.FI (EVM) / Jupiter (Solana) oracle baseline as the in-USD
    // mid-market quote. priceVariancePct = |grossOut - baseOut| / baseOut.
    // Routes that deviate >2% from the verified baseline are flagged.
    const priceVariancePct = baseOut > 0 ? Math.abs(grossOut - baseOut) / baseOut * 100 : 0;
    const priceVarianceFlag = priceVariancePct > 2.0;
    // Stronger guardrail: a deviation greater than 5% indicates a stale/glitched
    // aggregator quote. We surface a separate, more aggressive badge for these.
    const oracleDeviationFlag = priceVariancePct > 5.0;

    // ---- Health penalty (% of netOutUsd) ----
    const healthPenaltyUsd = netOutUsd * (HEALTH_PENALTY[p.health ?? 'ok'] * 0.01);

    // Ultimate ranking value — exactly the formula from the spec.
    // Higher = better. Time penalty only matters for cross-chain.
    const timePenaltyUsd = swapType === 'cross-chain' ? estTimeMin * 0.02 : 0;
    const variancePenaltyUsd = priceVarianceFlag ? netOutUsd * 0.05 : 0;
    const rankValue = netOutUsd - timePenaltyUsd - healthPenaltyUsd - variancePenaltyUsd;

    // ---- Build multi-hop visualizer path ----
    const fromChainMeta = CHAINS[from.chain];
    const toChainMeta = CHAINS[to.chain];
    const hops: RouteHop[] = swapType === 'same-chain'
      ? [
          { kind: 'asset',    label: from.symbol, sub: fromChainMeta.short, icon: fromChainMeta.icon },
          { kind: 'protocol', label: p.name },
          { kind: 'asset',    label: to.symbol,   sub: toChainMeta.short,   icon: toChainMeta.icon },
        ]
      : [
          { kind: 'asset',    label: from.symbol, sub: fromChainMeta.short, icon: fromChainMeta.icon },
          { kind: 'protocol', label: p.type === 'bridge' || p.type === 'privacy' ? `${p.name} (Bridge)` : `${p.name} (Router)` },
          { kind: 'asset',    label: '↔',          sub: `${fromChainMeta.short}→${toChainMeta.short}` },
          { kind: 'protocol', label: p.type === 'aggregator' ? `${p.name} (DEX Router)` : `${p.name} (Settlement)` },
          { kind: 'asset',    label: to.symbol,   sub: toChainMeta.short,   icon: toChainMeta.icon },
        ];

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
      customRecipient: p.customRecipient,
      noKyc: p.noKyc,
      noWallet: p.noWallet,
      mevProtected: p.mevProtected,
      offchainGasless: p.offchainGasless,
      limitOrders: p.limitOrders,
      gasRefuel: p.gasRefuel,
      unsupportedReason,
      health: p.health ?? 'ok',
      healthNote: p.healthNote,
      priceVariancePct,
      priceVarianceFlag,
      oracleDeviationFlag,
      hops,
      officialUrl: p.officialUrl ?? '',
    };
  });

  // Sort: supported first; within supported, unsafe-impact + bad-health
  // routes get pushed to the bottom; otherwise highest rankValue wins.
  const sorted = all.sort((a, b) => {
    if (a.supported !== b.supported) return a.supported ? -1 : 1;
    const aBad = (a.impactLevel === 'unsafe' || a.health === 'paused' || a.health === 'security_risk') ? 1 : 0;
    const bBad = (b.impactLevel === 'unsafe' || b.health === 'paused' || b.health === 'security_risk') ? 1 : 0;
    if (aBad !== bBad) return aBad - bBad;
    return b.rankValue - a.rankValue;
  });

  const best =
    sorted.find(q => q.supported && q.impactLevel !== 'unsafe' && q.health === 'ok' && !q.priceVarianceFlag) ??
    sorted.find(q => q.supported && q.impactLevel !== 'unsafe') ??
    sorted.find(q => q.supported) ??
    null;
  if (best) {
    best.isBest = true;
    // Savings vs median of the other supported routes — honest, not cherry-picked.
    const others = sorted.filter(q => q.supported && q.platformId !== best.platformId).map(q => q.netOutUsd);
    if (others.length) {
      const sortedOthers = [...others].sort((a, b) => a - b);
      const median = sortedOthers[Math.floor(sortedOthers.length / 2)];
      best.savedVsMedianUsd = Math.max(0, best.netOutUsd - median);
    }
  }
  return { swapType, quotes: sorted, best, privacyRoute, submarineRoute, orderType };
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

// ============= MEV / Slippage Protection Radar =============

export type MevRiskLevel = 'low' | 'high';

export interface MevRiskVerdict {
  level: MevRiskLevel;
  title: string;
  text: string;
}

export function evaluateMevRisk(q: Quote, fromChain: ChainId, lang: 'sk' | 'en' = 'sk'): MevRiskVerdict {
  const privateChannel = !!q.mevProtected;
  const impactSafe = q.impactLevel === 'ok';
  const varianceSafe = !q.priceVarianceFlag;
  const fam = CHAINS[fromChain].family;
  const noBotEcosystem = fam === 'btc' || fam === 'lightning' || fam === 'privacy';

  const low = noBotEcosystem || (privateChannel && impactSafe && varianceSafe);

  if (low) {
    return {
      level: 'low',
      title: lang === 'sk' ? '🟢 OCHRANA AKTÍVNA' : '🟢 PROTECTION ACTIVE',
      text: lang === 'sk'
        ? 'Smerovanie prebieha cez privátne kanály. Obchodní boti tvoju transakciu nevidia a nemôžu ťa predbehnúť ani umelo posunúť cenu.'
        : 'Routing goes through private channels. Trading bots cannot see your transaction or front-run / move the price against you.',
    };
  }
  return {
    level: 'high',
    title: lang === 'sk' ? '🚨 RISK BOT ÚTOKU' : '🚨 BOT ATTACK RISK',
    text: lang === 'sk'
      ? 'Na tejto trase hrozí, že ťa predbehnú predátorskí boti (Sandwich Attack), kvôli čomu dostaneš menej mincí. Odporúčame znížiť povolený preklz (Slippage) alebo zvoliť inú sieť.'
      : 'Predatory bots may front-run this route (Sandwich Attack), so you receive fewer coins. Lower slippage tolerance or pick another network.',
  };
}

// ============= Dust & Gas Fee Eater Filter =============

export interface GasEaterVerdict {
  warn: boolean;
  feePct: number;
  message: string;
}

const GAS_EATER_THRESHOLD_PCT = 5.0;
const CHEAP_CHAINS = new Set<ChainId>(['solana', 'arbitrum', 'base']);

export function evaluateGasEater(q: Quote, fromChain: ChainId, lang: 'sk' | 'en' = 'sk'): GasEaterVerdict {
  const grossUsd = q.netOutUsd + q.gasUsd + q.feeUsd + q.bridgeFeeUsd + q.priceImpactUsd + q.slippageBufferUsd;
  const totalFeeUsd = q.gasUsd + q.feeUsd + q.bridgeFeeUsd;
  const feePct = grossUsd > 0 ? (totalFeeUsd / grossUsd) * 100 : 0;

  if (CHEAP_CHAINS.has(fromChain) || feePct < GAS_EATER_THRESHOLD_PCT) {
    return { warn: false, feePct, message: '' };
  }
  return {
    warn: true,
    feePct,
    message: lang === 'sk'
      ? '⚠️ NEVÝHODNÝ SWAP (Vysoké poplatky): Sieťový poplatok (Gas) zhltne viac ako 5% z tvojej sumy. Tento swap je momentálne neefektívny. Ak je to možné, presuň transakciu na siete s lacnými poplatkami ako Solana, Arbitrum alebo Base.'
      : '⚠️ INEFFICIENT SWAP (High Fees): Network gas eats more than 5% of your amount. Move to cheap-fee chains like Solana, Arbitrum or Base.',
  };
}


// ============= Oracle Deviation Validator (5% threshold) =============
// Centralized helper that the Swap UI uses to tag any aggregator quote whose
// estimatedReceive (`netOut` × destination spot price) deviates more than 5%
// from the global oracle reference (LI.FI / Jupiter / CoinGecko). Routes
// flagged here render the "⚠️ Odchýlka kurzu" badge.

export interface AggregatorRateAudit {
  platformId: string;
  platformName: string;
  expectedUsd: number;       // grossInUsd at oracle reference
  receivedUsd: number;       // quote net-out USD value
  deviationPct: number;      // signed deviation %
  flagged: boolean;          // true when |deviation| > 5%
}

export const ORACLE_DEVIATION_THRESHOLD_PCT = 5.0;

export function validateAggregatorRates(
  quotes: Quote[],
  expectedUsd: number,
): AggregatorRateAudit[] {
  if (!expectedUsd || expectedUsd <= 0) {
    return quotes.map(q => ({
      platformId: q.platformId,
      platformName: q.platformName,
      expectedUsd: 0,
      receivedUsd: q.netOutUsd,
      deviationPct: 0,
      flagged: false,
    }));
  }
  return quotes.map(q => {
    const received = q.netOutUsd;
    const deviationPct = ((received - expectedUsd) / expectedUsd) * 100;
    const flagged = Math.abs(deviationPct) > ORACLE_DEVIATION_THRESHOLD_PCT;
    return {
      platformId: q.platformId,
      platformName: q.platformName,
      expectedUsd,
      receivedUsd: received,
      deviationPct,
      flagged,
    };
  });
}
