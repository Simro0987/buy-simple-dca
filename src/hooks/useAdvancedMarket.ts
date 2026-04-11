import { useQuery } from '@tanstack/react-query';
import { TOKENS } from '@/lib/crypto';

export interface BtcDominance {
  dominance: number;
  trend: 'rising' | 'falling' | 'stable';
}

export interface TradingMetrics {
  fundingRate: number; // avg across exchanges (simulated)
  openInterestTrend: 'rising' | 'falling' | 'stable';
  spotVolumeTrend: 'rising' | 'falling' | 'stable';
  crowdSignal: 'long_crowded' | 'short_crowded' | 'balanced';
  pressure: 'bullish' | 'bearish' | 'neutral';
}

export interface LiquidationLevel {
  price: number;
  side: 'long' | 'short';
  intensity: 'low' | 'medium' | 'high';
}

export interface WhaleActivity {
  signal: 'accumulating' | 'distributing' | 'neutral';
  largeTransactions24h: number;
  netFlow: 'inflow' | 'outflow' | 'neutral';
}

export interface CryptoEvent {
  date: string;
  title: string;
  importance: 'high' | 'medium' | 'low';
  category: 'macro' | 'crypto' | 'token_unlock' | 'upgrade';
}

export interface AdvancedMarketData {
  btcDominance: BtcDominance;
  tradingMetrics: TradingMetrics;
  liquidationLevels: LiquidationLevel[];
  whaleActivity: WhaleActivity;
  institutionalFlow: { label: string; trend: 'buying' | 'selling' | 'neutral' }[];
  events: CryptoEvent[];
  socialSentiment: 'bullish' | 'neutral' | 'bearish';
  aggregatedSignal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  signalScore: number; // -100 to +100
  signalExplanation: string;
}

function computeSignal(
  fearGreedValue: number,
  btcChange24h: number,
  dominanceTrend: string,
  fundingRate: number,
): { signal: AdvancedMarketData['aggregatedSignal']; score: number; explanation: string } {
  let score = 0;

  // Fear & Greed contribution
  if (fearGreedValue <= 20) score += 30; // extreme fear = buy signal
  else if (fearGreedValue <= 35) score += 15;
  else if (fearGreedValue >= 80) score -= 30; // extreme greed = sell signal
  else if (fearGreedValue >= 65) score -= 15;

  // BTC momentum
  if (btcChange24h > 5) score += 10;
  else if (btcChange24h > 2) score += 5;
  else if (btcChange24h < -5) score -= 10;
  else if (btcChange24h < -2) score -= 5;

  // Funding rate
  if (fundingRate > 0.05) score -= 15; // high funding = crowded longs
  else if (fundingRate > 0.02) score -= 5;
  else if (fundingRate < -0.02) score += 10; // negative funding = shorts paying
  else if (fundingRate < 0) score += 5;

  // Dominance trend
  if (dominanceTrend === 'rising') score -= 5; // risk-off
  else if (dominanceTrend === 'falling') score += 5; // alt expansion

  score = Math.max(-100, Math.min(100, score));

  let signal: AdvancedMarketData['aggregatedSignal'];
  if (score >= 40) signal = 'strong_buy';
  else if (score >= 15) signal = 'buy';
  else if (score <= -40) signal = 'strong_sell';
  else if (score <= -15) signal = 'sell';
  else signal = 'hold';

  // Slovak explanation
  const parts: string[] = [];
  if (fearGreedValue <= 25) parts.push('extrémny strach na trhu');
  else if (fearGreedValue >= 75) parts.push('extrémna chamtivosť');
  if (fundingRate > 0.03) parts.push('funding vysoký, veľa long pozícií');
  else if (fundingRate < -0.01) parts.push('funding negatívny, shorty platia');
  if (btcChange24h < -5) parts.push('silný pokles BTC');
  else if (btcChange24h > 5) parts.push('silný rast BTC');
  if (dominanceTrend === 'rising') parts.push('BTC dominancia rastie (risk-off)');
  else if (dominanceTrend === 'falling') parts.push('BTC dominancia klesá (altcoin expanzia)');

  let explanation: string;
  if (score >= 40) explanation = `Silný nákupný signál: ${parts.join(', ') || 'podmienky priaznivé'}`;
  else if (score >= 15) explanation = `Mierne býčie podmienky: ${parts.join(', ') || 'trh stabilný'}`;
  else if (score <= -40) explanation = `Silné varovanie: ${parts.join(', ')} → zvýšené riziko poklesu`;
  else if (score <= -15) explanation = `Trh je prekúpený: ${parts.join(', ')} → opatrnosť`;
  else explanation = `Neutrálny trh: ${parts.join(', ') || 'žiadne výrazné signály'}`;

  return { signal, score, explanation };
}

async function fetchAdvancedMarket(): Promise<AdvancedMarketData> {
  // Fetch BTC dominance from CoinGecko global endpoint
  const [globalRes, priceRes, fgRes] = await Promise.all([
    fetch('https://api.coingecko.com/api/v3/global').catch(() => null),
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true').catch(() => null),
    fetch('https://api.alternative.me/fng/?limit=1').catch(() => null),
  ]);

  let dominance = 55;
  try {
    if (globalRes?.ok) {
      const gd = await globalRes.json();
      dominance = gd.data?.market_cap_percentage?.btc ?? 55;
    }
  } catch { /* fallback */ }

  let btcChange = 0;
  try {
    if (priceRes?.ok) {
      const pd = await priceRes.json();
      btcChange = pd.bitcoin?.usd_24h_change ?? 0;
    }
  } catch { /* fallback */ }

  let fearGreedValue = 50;
  try {
    if (fgRes?.ok) {
      const fg = await fgRes.json();
      fearGreedValue = parseInt(fg.data?.[0]?.value ?? '50');
    }
  } catch { /* fallback */ }

  // Derived heuristics
  const dominanceTrend: BtcDominance['trend'] = dominance > 58 ? 'rising' : dominance < 50 ? 'falling' : 'stable';

  // Simulated trading metrics (these would need exchange APIs)
  const fundingRate = (Math.random() - 0.5) * 0.06; // -0.03 to 0.03
  const oiTrend = btcChange > 2 ? 'rising' : btcChange < -2 ? 'falling' : 'stable' as const;
  const crowdSignal = fundingRate > 0.02 ? 'long_crowded' : fundingRate < -0.02 ? 'short_crowded' : 'balanced' as const;
  const pressure = fundingRate > 0.01 ? 'bullish' : fundingRate < -0.01 ? 'bearish' : 'neutral' as const;

  // Simulated whale activity
  const whaleSignal = btcChange > 3 ? 'accumulating' : btcChange < -3 ? 'distributing' : 'neutral' as const;

  // Social sentiment from fear/greed
  const socialSentiment = fearGreedValue >= 60 ? 'bullish' : fearGreedValue <= 40 ? 'bearish' : 'neutral' as const;

  // BTC liquidation levels (heuristic based on current price)
  let btcPrice = 100000;
  try {
    if (priceRes) {
      const pd2 = await priceRes.json().catch(() => null);
      btcPrice = pd2?.bitcoin?.usd ?? 100000;
    }
  } catch { /* fallback */ }

  const liquidationLevels: LiquidationLevel[] = [
    { price: btcPrice * 0.95, side: 'long', intensity: 'high' },
    { price: btcPrice * 0.92, side: 'long', intensity: 'medium' },
    { price: btcPrice * 1.05, side: 'short', intensity: 'high' },
    { price: btcPrice * 1.08, side: 'short', intensity: 'medium' },
  ];

  // Upcoming events (static curated list)
  const events: CryptoEvent[] = [
    { date: '2026-06-18', title: 'Fed rozhodnutie o úrokoch', importance: 'high', category: 'macro' },
    { date: '2026-05-15', title: 'Ethereum Pectra upgrade', importance: 'high', category: 'upgrade' },
    { date: '2026-05-01', title: 'SOL token unlock (5M)', importance: 'medium', category: 'token_unlock' },
    { date: '2026-04-30', title: 'BTC ETF rebalancing', importance: 'medium', category: 'crypto' },
  ];

  // Institutional flow (simulated)
  const msFlow: 'buying' | 'neutral' | 'selling' = btcChange > 0 ? 'buying' : 'neutral';
  const etfFlow: 'buying' | 'neutral' | 'selling' = btcChange > 1 ? 'buying' : btcChange < -1 ? 'selling' : 'neutral';
  const institutionalFlow: { label: string; trend: 'buying' | 'selling' | 'neutral' }[] = [
    { label: 'MicroStrategy', trend: msFlow },
    { label: 'BTC ETF', trend: etfFlow },
  ];

  const { signal, score, explanation } = computeSignal(fearGreedValue, btcChange, dominanceTrend, fundingRate);

  return {
    btcDominance: { dominance, trend: dominanceTrend },
    tradingMetrics: {
      fundingRate,
      openInterestTrend: oiTrend,
      spotVolumeTrend: oiTrend,
      crowdSignal,
      pressure,
    },
    liquidationLevels,
    whaleActivity: {
      signal: whaleSignal,
      largeTransactions24h: Math.floor(50 + Math.random() * 100),
      netFlow: whaleSignal === 'accumulating' ? 'inflow' : whaleSignal === 'distributing' ? 'outflow' : 'neutral',
    },
    institutionalFlow,
    events,
    socialSentiment,
    aggregatedSignal: signal,
    signalScore: score,
    signalExplanation: explanation,
  };
}

export function useAdvancedMarket() {
  return useQuery({
    queryKey: ['advanced-market'],
    queryFn: fetchAdvancedMarket,
    refetchInterval: 120000,
    staleTime: 60000,
  });
}
