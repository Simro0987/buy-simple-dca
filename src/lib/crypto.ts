export interface TokenConfig {
  id: string;
  symbol: string;
  name: string;
  allocation: number;
  limitDiscount: number;
  color: string;
  coingeckoId: string;
}

export const TOKENS: TokenConfig[] = [
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', allocation: 0.59, limitDiscount: 0.97, color: '#F7931A', coingeckoId: 'bitcoin' },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', allocation: 0.25, limitDiscount: 0.96, color: '#627EEA', coingeckoId: 'ethereum' },
  { id: 'sol', symbol: 'SOL', name: 'Solana', allocation: 0.11, limitDiscount: 0.95, color: '#9945FF', coingeckoId: 'solana' },
  { id: 'hype', symbol: 'HYPE', name: 'Hyperliquid', allocation: 0.05, limitDiscount: 0.90, color: '#00D4AA', coingeckoId: 'hyperliquid' },
];

export const MARKET_SPLIT = 0.60;
export const LIMIT_SPLIT = 0.40;

export interface PriceData {
  [key: string]: {
    usd: number;
    usd_24h_change?: number;
    ath?: number;
  };
}

export async function fetchPrices(): Promise<PriceData> {
  const ids = TOKENS.map(t => t.coingeckoId).join(',');
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  );
  if (!res.ok) throw new Error('Failed to fetch prices');
  return res.json();
}

export async function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    const data = await res.json();
    return {
      value: parseInt(data.data[0].value),
      classification: data.data[0].value_classification,
    };
  } catch {
    return { value: 50, classification: 'Neutral' };
  }
}

export interface DCAResult {
  token: TokenConfig;
  totalUsd: number;
  marketUsd: number;
  limitUsd: number;
  marketQuantity: number;
  limitQuantity: number;
  limitPrice: number;
  currentPrice: number;
}

export function calculateDCA(weeklyBudget: number, prices: PriceData): DCAResult[] {
  return TOKENS.map(token => {
    const totalUsd = weeklyBudget * token.allocation;
    const marketUsd = totalUsd * MARKET_SPLIT;
    const limitUsd = totalUsd * LIMIT_SPLIT;
    const currentPrice = prices[token.coingeckoId]?.usd || 0;
    const limitPrice = currentPrice * token.limitDiscount;
    const marketQuantity = currentPrice > 0 ? marketUsd / currentPrice : 0;
    const limitQuantity = limitPrice > 0 ? limitUsd / limitPrice : 0;

    return {
      token,
      totalUsd,
      marketUsd,
      limitUsd,
      marketQuantity,
      limitQuantity,
      limitPrice,
      currentPrice,
    };
  });
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPrice(value: number): string {
  if (value >= 1000) return formatUsd(value);
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

export function formatQuantity(value: number, symbol: string): string {
  if (symbol === 'BTC') return value.toFixed(8);
  if (symbol === 'ETH') return value.toFixed(6);
  return value.toFixed(4);
}
