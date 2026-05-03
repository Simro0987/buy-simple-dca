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
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', allocation: 0.64, limitDiscount: 0.97, color: '#F7931A', coingeckoId: 'bitcoin' },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', allocation: 0.25, limitDiscount: 0.96, color: '#627EEA', coingeckoId: 'ethereum' },
  { id: 'sol', symbol: 'SOL', name: 'Solana', allocation: 0.11, limitDiscount: 0.95, color: '#9945FF', coingeckoId: 'solana' },
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

import { cgFetch } from './coingecko';

export async function fetchPrices(): Promise<PriceData> {
  const ids = TOKENS.map(t => t.coingeckoId).join(',');
  const res = await cgFetch('/simple/price', {
    ids, vs_currencies: 'usd', include_24hr_change: true, include_24hr_vol: true,
  });
  if (!res.ok) throw new Error('Failed to fetch prices');
  return res.json();
}

export interface AthData {
  [key: string]: {
    ath: number;
    ath_date: string;
    ath_change_percentage: number;
  };
}

export type SparklineData = Record<string, number[]>;

export async function fetchAthData(): Promise<AthData> {
  const ids = TOKENS.map(t => t.coingeckoId).join(',');
  const res = await cgFetch('/coins/markets', { vs_currency: 'usd', ids, order: 'market_cap_desc' });
  if (!res.ok) throw new Error('Failed to fetch ATH data');
  const coins: Array<{ id: string; ath: number; ath_date: string; ath_change_percentage: number }> = await res.json();
  const result: AthData = {};
  for (const coin of coins) {
    result[coin.id] = {
      ath: coin.ath,
      ath_date: coin.ath_date,
      ath_change_percentage: coin.ath_change_percentage,
    };
  }
  return result;
}

export async function fetchSparklines(days = 7): Promise<SparklineData> {
  const ids = TOKENS.map(t => t.coingeckoId).join(',');
  const res = await cgFetch('/coins/markets', {
    vs_currency: 'usd', ids, order: 'market_cap_desc', sparkline: true, price_change_percentage: '7d',
  });
  if (!res.ok) throw new Error('Failed to fetch sparklines');
  const coins: Array<{ id: string; sparkline_in_7d?: { price: number[] } }> = await res.json();
  const result: SparklineData = {};
  for (const coin of coins) {
    const prices: number[] = coin.sparkline_in_7d?.price || [];
    // Downsample to ~48 points for clean rendering
    if (prices.length > 48) {
      const step = Math.floor(prices.length / 48);
      result[coin.id] = prices.filter((_: number, i: number) => i % step === 0);
    } else {
      result[coin.id] = prices;
    }
  }
  return result;
}

export async function fetchAltSeasonIndex(): Promise<{ value: number; label: string }> {
  try {
    // Alt season heuristic: if >75% of top alts outperform BTC over 90 days = alt season
    const res = await cgFetch('/simple/price', {
      ids: 'bitcoin,ethereum,solana', vs_currencies: 'usd', include_24hr_change: true,
    });
    const data = await res.json();
    const btcChange = data.bitcoin?.usd_24h_change ?? 0;
    const ethChange = data.ethereum?.usd_24h_change ?? 0;
    const solChange = data.solana?.usd_24h_change ?? 0;
    const altAvg = (ethChange + solChange) / 2;
    const diff = altAvg - btcChange;
    // Simple scoring: positive diff = alt season leaning
    const score = Math.max(0, Math.min(100, 50 + diff * 5));
    let label: string;
    if (score >= 75) label = 'Alt Season';
    else if (score >= 50) label = 'Neutral';
    else label = 'BTC Season';
    return { value: Math.round(score), label };
  } catch {
    return { value: 50, label: 'Neutral' };
  }
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
