import { useMemo } from 'react';
import { PriceData, AthData } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';

export interface MarketCycleResult {
  score: number;
  zone: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'euphoria';
  label: string;
  interpretation: string;
  guidance: string;
  indicators: CycleIndicator[];
  tokenContext: TokenCycleContext[];
}

export interface CycleIndicator {
  name: string;
  value: number;
  score: number; // normalized 0-100
  weight: number;
}

export interface TokenCycleContext {
  symbol: string;
  color: string;
  athDistance: number; // negative percentage
  strength24h: number; // vs BTC relative
}

interface ComputeInput {
  fearGreed?: { value: number; classification: string };
  altSeason?: { value: number; label: string };
  prices?: PriceData;
  athData?: AthData;
  lang: Lang;
}

function normalizeAthDistance(pct: number): number {
  // pct is negative (e.g., -47 means 47% below ATH)
  // Near ATH (0%) = euphoria (100), far from ATH (-80%) = fear (0)
  const dist = Math.abs(pct);
  if (dist <= 5) return 95;
  if (dist <= 15) return 80;
  if (dist <= 30) return 60;
  if (dist <= 50) return 40;
  if (dist <= 70) return 20;
  return 10;
}

function normalizeVolumeTrend(prices: PriceData): number {
  // Use 24h volume data if available; higher volume in uptrend = bullish
  const btcVol = (prices?.bitcoin as any)?.usd_24h_vol ?? 0;
  // Heuristic: $40B+ daily vol = high activity
  if (btcVol > 60e9) return 75;
  if (btcVol > 40e9) return 60;
  if (btcVol > 25e9) return 45;
  if (btcVol > 15e9) return 30;
  return 20;
}

function getZone(score: number): MarketCycleResult['zone'] {
  if (score <= 20) return 'extreme_fear';
  if (score <= 40) return 'bearish';
  if (score <= 60) return 'neutral';
  if (score <= 80) return 'bullish';
  return 'euphoria';
}

function getLabel(zone: MarketCycleResult['zone'], sk: boolean): string {
  const labels = {
    extreme_fear: sk ? 'Extrémny strach' : 'Extreme Fear',
    bearish: sk ? 'Medvedí trh' : 'Bearish',
    neutral: sk ? 'Neutrálny' : 'Neutral',
    bullish: sk ? 'Rastový trh' : 'Bullish',
    euphoria: sk ? 'Eufória' : 'Euphoria',
  };
  return labels[zone];
}

function getInterpretation(zone: MarketCycleResult['zone'], sk: boolean): string {
  const texts = {
    extreme_fear: sk
      ? 'Trh je v zóne extrémneho strachu. Historicky dobré obdobie na akumuláciu.'
      : 'Market is in extreme fear zone. Historically good accumulation period.',
    bearish: sk
      ? 'Trh je v medvedej fáze. Pokračuj v DCA a nepanikár.'
      : 'Market is in bearish phase. Continue DCA and stay calm.',
    neutral: sk
      ? 'Trh je neutrálny. Žiadne extrémne signály – drž sa plánu.'
      : 'Market is neutral. No extreme signals – stick to the plan.',
    bullish: sk
      ? 'Trh je v rastovej fáze. Zvýšená pozornosť na risk management.'
      : 'Market is in growth phase. Increased attention to risk management.',
    euphoria: sk
      ? 'Trh vykazuje znaky eufórie. Zvýšené riziko prehriatia.'
      : 'Market shows euphoria signs. Increased overheating risk.',
  };
  return texts[zone];
}

function getGuidance(zone: MarketCycleResult['zone'], sk: boolean): string {
  const texts = {
    extreme_fear: sk ? '→ Pokračuj v DCA, zvýš akumuláciu' : '→ Continue DCA, increase accumulation',
    bearish: sk ? '→ Pokračuj v DCA podľa plánu' : '→ Continue DCA per plan',
    neutral: sk ? '→ Drž sa stratégie, bez zmien' : '→ Stick to strategy, no changes',
    bullish: sk ? '→ Zváž zníženie rizika, neprepadaj FOMO' : '→ Consider reducing risk, avoid FOMO',
    euphoria: sk ? '→ Neprepadaj FOMO, zváž čiastočný výber' : '→ Avoid FOMO, consider partial exit',
  };
  return texts[zone];
}

export function useMarketCycleScore(input: ComputeInput): MarketCycleResult | null {
  const { fearGreed, altSeason, prices, athData, lang } = input;
  return useMemo(() => {
    const sk = lang === 'sk';

    if (!fearGreed || !prices) return null;

    const indicators: CycleIndicator[] = [];

    // 1. Fear & Greed (weight: 30%)
    indicators.push({
      name: sk ? 'Strach & Chamtivosť' : 'Fear & Greed',
      value: fearGreed.value,
      score: fearGreed.value,
      weight: 0.30,
    });

    // 2. BTC distance from ATH (weight: 25%)
    const btcAth = athData?.bitcoin?.ath_change_percentage ?? -50;
    const athScore = normalizeAthDistance(btcAth);
    indicators.push({
      name: sk ? 'BTC vzdialenosť od ATH' : 'BTC Distance from ATH',
      value: Math.round(btcAth),
      score: athScore,
      weight: 0.25,
    });

    // 3. Alt Season Index (weight: 15%)
    const altScore = altSeason?.value ?? 50;
    indicators.push({
      name: sk ? 'Alt Season Index' : 'Alt Season Index',
      value: altScore,
      score: altScore,
      weight: 0.15,
    });

    // 4. Volume trend (weight: 15%)
    const volScore = normalizeVolumeTrend(prices);
    indicators.push({
      name: sk ? 'Objem obchodovania' : 'Trading Volume',
      value: volScore,
      score: volScore,
      weight: 0.15,
    });

    // 5. BTC 24h momentum as proxy for trend (weight: 15%)
    const btc24h = prices?.bitcoin?.usd_24h_change ?? 0;
    const momentumScore = Math.max(0, Math.min(100, 50 + btc24h * 5));
    indicators.push({
      name: sk ? 'BTC momentum (24h)' : 'BTC Momentum (24h)',
      value: Math.round(btc24h * 10) / 10,
      score: Math.round(momentumScore),
      weight: 0.15,
    });

    // Weighted score
    const totalScore = Math.round(
      indicators.reduce((sum, ind) => sum + ind.score * ind.weight, 0)
    );
    const clampedScore = Math.max(0, Math.min(100, totalScore));
    const zone = getZone(clampedScore);

    // Token context
    const tokenContext: TokenCycleContext[] = [
      { symbol: 'BTC', color: '#F7931A', athDistance: athData?.bitcoin?.ath_change_percentage ?? 0, strength24h: 0 },
      { symbol: 'ETH', color: '#627EEA', athDistance: athData?.ethereum?.ath_change_percentage ?? 0, strength24h: (prices?.ethereum?.usd_24h_change ?? 0) - (prices?.bitcoin?.usd_24h_change ?? 0) },
      { symbol: 'SOL', color: '#9945FF', athDistance: athData?.solana?.ath_change_percentage ?? 0, strength24h: (prices?.solana?.usd_24h_change ?? 0) - (prices?.bitcoin?.usd_24h_change ?? 0) },
    ];

    return {
      score: clampedScore,
      zone,
      label: getLabel(zone, sk),
      interpretation: getInterpretation(zone, sk),
      guidance: getGuidance(zone, sk),
      indicators,
      tokenContext,
    };
  }, [fearGreed, altSeason, prices, athData, lang]);
}
