import { useQuery } from '@tanstack/react-query';
import { TOKENS } from '@/lib/crypto';
import { cgFetch } from '@/lib/coingecko';

export interface TokenAnalysis {
  id: string;
  symbol: string;
  name: string;
  color: string;
  price: number;
  marketCap: number;
  totalVolume: number;
  change24h: number;
  change7d: number;
  change30d: number;
  ath: number;
  athChangePercentage: number;
  circulatingSupply: number;
  totalSupply: number | null;
  sparkline7d: number[];
  // Computed technical indicators
  rsi14: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  bollingerPosition: 'upper' | 'middle' | 'lower';
  volatility30d: number;
  trend: 'up' | 'down' | 'sideways';
  support: number;
  resistance: number;
  fibLevels: { level: string; price: number }[];
  // Fundamental
  stakingPct: number;
  networkHealth: 'strong' | 'moderate' | 'weak';
}

function computeRSI(prices: number[]): number {
  if (prices.length < 15) return 50;
  const period = 14;
  const slice = prices.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeTrend(prices: number[]): 'up' | 'down' | 'sideways' {
  if (prices.length < 10) return 'sideways';
  const recent = prices.slice(-10);
  const first = recent.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last = recent.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const pctChange = ((last - first) / first) * 100;
  if (pctChange > 3) return 'up';
  if (pctChange < -3) return 'down';
  return 'sideways';
}

function computeVolatility(prices: number[]): number {
  if (prices.length < 5) return 0;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100; // annualized %
}

function computeBollingerPosition(prices: number[]): 'upper' | 'middle' | 'lower' {
  if (prices.length < 20) return 'middle';
  const period = 20;
  const slice = prices.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(slice.reduce((a, p) => a + (p - sma) ** 2, 0) / period);
  const upper = sma + 2 * stdDev;
  const lower = sma - 2 * stdDev;
  const current = prices[prices.length - 1];
  if (current > upper - stdDev * 0.5) return 'upper';
  if (current < lower + stdDev * 0.5) return 'lower';
  return 'middle';
}

function computeMACDSignal(prices: number[]): 'bullish' | 'bearish' | 'neutral' {
  if (prices.length < 26) return 'neutral';
  const ema = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    let prev = data[0];
    return data.map((v) => (prev = v * k + prev * (1 - k)));
  };
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine.slice(-9), 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  if (lastMacd > lastSignal + 0.001) return 'bullish';
  if (lastMacd < lastSignal - 0.001) return 'bearish';
  return 'neutral';
}

function computeFibLevels(high: number, low: number): { level: string; price: number }[] {
  const diff = high - low;
  return [
    { level: '0%', price: low },
    { level: '23.6%', price: low + diff * 0.236 },
    { level: '38.2%', price: low + diff * 0.382 },
    { level: '50%', price: low + diff * 0.5 },
    { level: '61.8%', price: low + diff * 0.618 },
    { level: '78.6%', price: low + diff * 0.786 },
    { level: '100%', price: high },
  ];
}

const STAKING_PCTS: Record<string, number> = {
  bitcoin: 0, ethereum: 28, solana: 67,
};

async function fetchTokenAnalysis(): Promise<TokenAnalysis[]> {
  const ids = TOKENS.map((t) => t.coingeckoId).join(',');
  const res = await cgFetch('/coins/markets', {
    vs_currency: 'usd', ids, order: 'market_cap_desc', sparkline: true, price_change_percentage: '7d,30d',
  });
  if (!res.ok) throw new Error('Failed to fetch analysis data');
  const coins: Array<{
    id: string;
    sparkline_in_7d?: { price: number[] };
    ath?: number;
    current_price?: number;
    market_cap?: number;
    total_volume?: number;
    price_change_percentage_24h?: number;
    price_change_percentage_7d_in_currency?: number;
    price_change_percentage_30d_in_currency?: number;
    ath_change_percentage?: number;
    circulating_supply?: number;
    total_supply?: number;
  }> = await res.json();

  return coins.map((coin) => {
    const token = TOKENS.find((t) => t.coingeckoId === coin.id)!;
    const sparkline: number[] = coin.sparkline_in_7d?.price || [];
    const rsi14 = computeRSI(sparkline);
    const trend = computeTrend(sparkline);
    const volatility30d = computeVolatility(sparkline);
    const bollingerPosition = computeBollingerPosition(sparkline);
    const macdSignal = computeMACDSignal(sparkline);
    const high = coin.ath ?? Math.max(...sparkline);
    const low = Math.min(...(sparkline.length ? sparkline : [coin.current_price]));
    const fibLevels = computeFibLevels(high, low);
    const support = sparkline.length > 10 ? Math.min(...sparkline.slice(-20)) : coin.current_price * 0.9;
    const resistance = sparkline.length > 10 ? Math.max(...sparkline.slice(-20)) : coin.current_price * 1.1;
    const stakingPct = STAKING_PCTS[coin.id] ?? 0;
    const networkHealth: 'strong' | 'moderate' | 'weak' =
      (coin.market_cap ?? 0) > 50e9 ? 'strong' : (coin.market_cap ?? 0) > 5e9 ? 'moderate' : 'weak';

    return {
      id: coin.id,
      symbol: token.symbol,
      name: token.name,
      color: token.color,
      price: coin.current_price ?? 0,
      marketCap: coin.market_cap ?? 0,
      totalVolume: coin.total_volume ?? 0,
      change24h: coin.price_change_percentage_24h ?? 0,
      change7d: coin.price_change_percentage_7d_in_currency ?? 0,
      change30d: coin.price_change_percentage_30d_in_currency ?? 0,
      ath: coin.ath ?? 0,
      athChangePercentage: coin.ath_change_percentage ?? 0,
      circulatingSupply: coin.circulating_supply ?? 0,
      totalSupply: coin.total_supply ?? null,
      sparkline7d: sparkline,
      rsi14,
      macdSignal,
      bollingerPosition,
      volatility30d,
      trend,
      support,
      resistance,
      fibLevels,
      stakingPct,
      networkHealth,
    };
  });
}

export function useTokenAnalysis() {
  return useQuery({
    queryKey: ['token-analysis'],
    queryFn: fetchTokenAnalysis,
    refetchInterval: 120000,
    staleTime: 60000,
  });
}
