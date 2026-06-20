import { useTokenAnalysis } from './useTokenAnalysis';
import { useFearGreed, usePrices } from './usePrices';
import { useBtc200dMA } from './useBtc200dMA';
import { useMarketData } from './useMarketData';
import { useAdvancedMarket } from './useAdvancedMarket';

export type OctToken = 'BTC' | 'ETH' | 'SOL';

export interface AxisPoint { axis: string; value: number }
export interface OctTokenMetrics { axes: AxisPoint[]; color: string }

const COLORS: Record<OctToken, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
};

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function bollingerToScore(pos: 'upper' | 'middle' | 'lower'): number {
  return pos === 'upper' ? 82 : pos === 'lower' ? 18 : 50;
}

/** Macro MFI proxy — price momentum with weekly bias */
function approxMFI(change24h: number, change7d: number): number {
  return clamp(50 + change24h * 1.8 + change7d * 1.1);
}

/** 200WMA distance % → 0-100 */
function wmaDistToScore(distPct: number): number {
  return clamp(50 + distPct * 0.55);
}

/** On-chain momentum proxy: 30d momentum + network health */
function approxOnchain(change30d: number, health: 'strong' | 'moderate' | 'weak'): number {
  const base = (change30d + 35) / 70 * 100;
  const bonus = health === 'strong' ? 8 : health === 'weak' ? -8 : 0;
  return clamp(base + bonus);
}

/**
 * MVRV Z-Score proxy → 0-100
 * price / realizedPrice:  <1 = bottom (5–20), 1–2 = DCA zone (20–55),
 * 2–3.5 = caution (55–80), >3.5 = euphoria (80–95)
 */
function mvrvToScore(price: number, realizedPrice: number): number {
  if (realizedPrice <= 0) return 50;
  const mvrv = price / realizedPrice;
  return clamp(((mvrv - 0.5) / 5) * 100);
}

/**
 * Funding Rate → 0-100
 * Negative funding = shorts paying = bullish DCA context → low score
 * High positive = crowded longs = euphoria risk → high score
 */
function fundingToScore(rate: number): number {
  return clamp(50 + rate * 1200);
}

export function useConfluenceMetrics() {
  const {
    data: tokenData,
    isLoading: tokenLoading,
    error: tokenError,
    refetch: refetchToken,
  } = useTokenAnalysis();

  const {
    data: fg,
    isLoading: fgLoading,
    error: fgError,
    refetch: refetchFg,
  } = useFearGreed();

  const {
    data: ma200,
    isLoading: maLoading,
    refetch: refetchMa,
  } = useBtc200dMA();

  const { data: marketData, refetch: refetchMarket } = useMarketData();
  const { data: advMarket,  refetch: refetchAdv   } = useAdvancedMarket();
  const { data: prices } = usePrices();

  const isLoading = tokenLoading || fgLoading || maLoading;
  const hasError  = !!(tokenError && fgError);

  async function refetch() {
    await Promise.allSettled([
      refetchToken(), refetchFg(), refetchMa(),
      refetchMarket(), refetchAdv(),
    ]);
  }

  let metrics: Record<OctToken, OctTokenMetrics> | undefined;

  if (tokenData) {
    const fgValue      = fg?.value ?? 50;
    const fundingRate  = advMarket?.tradingMetrics?.fundingRate ?? 0;
    const fundingScore = fundingToScore(fundingRate);

    metrics = (['BTC', 'ETH', 'SOL'] as OctToken[]).reduce((acc, sym) => {
      const t = tokenData.find(x => x.symbol === sym);
      if (!t) return acc;

      // 200WMA: BTC → actual distancePct; ETH/SOL → ATH-distance proxy
      let wmaScore: number;
      if (sym === 'BTC' && ma200) {
        wmaScore = wmaDistToScore(ma200.distancePct);
      } else {
        wmaScore = clamp(50 - t.athChangePercentage * 0.3);
      }

      // MVRV: BTC → live price / realized price; ETH/SOL → ATH proxy
      let mvrvScore: number;
      if (sym === 'BTC') {
        const livePrice     = prices?.bitcoin?.usd ?? marketData?.btc?.price ?? 0;
        const realizedPrice = marketData?.btc?.realizedPrice ?? 53600;
        mvrvScore = mvrvToScore(livePrice, realizedPrice);
      } else {
        // athChangePercentage is negative (e.g. −40 = 40% below ATH = cheap)
        mvrvScore = clamp(50 - t.athChangePercentage * 0.28);
      }

      acc[sym] = {
        color: COLORS[sym],
        axes: [
          { axis: 'W-RSI',      value: clamp(t.rsi14) },
          { axis: 'Macro MFI',  value: approxMFI(t.change24h, t.change7d) },
          { axis: 'Bollinger',  value: bollingerToScore(t.bollingerPosition) },
          { axis: 'Fear/Greed', value: clamp(fgValue) },
          { axis: '200WMA',     value: wmaScore },
          { axis: 'On-chain',   value: approxOnchain(t.change30d, t.networkHealth) },
          { axis: 'MVRV',       value: mvrvScore },
          { axis: 'Funding',    value: fundingScore },
        ],
      };
      return acc;
    }, {} as Record<OctToken, OctTokenMetrics>);
  }

  return { metrics, isLoading, hasError, refetch };
}
