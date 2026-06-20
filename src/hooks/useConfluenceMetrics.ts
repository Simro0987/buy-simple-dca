import { useTokenAnalysis } from './useTokenAnalysis';
import { useFearGreed, usePrices } from './usePrices';
import { useBtc200dMA } from './useBtc200dMA';
import { useMarketData } from './useMarketData';
import { useAdvancedMarket } from './useAdvancedMarket';

export type OctToken = 'BTC' | 'ETH' | 'SOL';
export type DataQuality = 'live' | 'partial' | 'disconnected';

export interface AxisPoint { axis: string; value: number; live: boolean }
export interface OctTokenMetrics { axes: AxisPoint[]; color: string }

const COLORS: Record<OctToken, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
};

// Neutral baseline shown when all APIs fail
const FALLBACK_METRICS: Record<OctToken, OctTokenMetrics> = {
  BTC: { color: COLORS.BTC, axes: [
    { axis: 'W-RSI',      value: 45, live: false },
    { axis: 'Macro MFI',  value: 42, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 48, live: false },
    { axis: 'On-chain',   value: 44, live: false },
    { axis: 'MVRV',       value: 46, live: false },
    { axis: 'Funding',    value: 50, live: false },
  ]},
  ETH: { color: COLORS.ETH, axes: [
    { axis: 'W-RSI',      value: 55, live: false },
    { axis: 'Macro MFI',  value: 52, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 56, live: false },
    { axis: 'On-chain',   value: 58, live: false },
    { axis: 'MVRV',       value: 54, live: false },
    { axis: 'Funding',    value: 50, live: false },
  ]},
  SOL: { color: COLORS.SOL, axes: [
    { axis: 'W-RSI',      value: 62, live: false },
    { axis: 'Macro MFI',  value: 58, live: false },
    { axis: 'Bollinger',  value: 50, live: false },
    { axis: 'Fear/Greed', value: 40, live: false },
    { axis: '200WMA',     value: 60, live: false },
    { axis: 'On-chain',   value: 64, live: false },
    { axis: 'MVRV',       value: 59, live: false },
    { axis: 'Funding',    value: 50, live: false },
  ]},
};

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function bollingerToScore(pos: 'upper' | 'middle' | 'lower'): number {
  return pos === 'upper' ? 82 : pos === 'lower' ? 18 : 50;
}

function approxMFI(change24h: number, change7d: number): number {
  return clamp(50 + change24h * 1.8 + change7d * 1.1);
}

function wmaDistToScore(distPct: number): number {
  return clamp(50 + distPct * 0.55);
}

function approxOnchain(change30d: number, health: 'strong' | 'moderate' | 'weak'): number {
  const base = (change30d + 35) / 70 * 100;
  const bonus = health === 'strong' ? 8 : health === 'weak' ? -8 : 0;
  return clamp(base + bonus);
}

function mvrvToScore(price: number, realizedPrice: number): number {
  if (realizedPrice <= 0) return 50;
  return clamp(((price / realizedPrice - 0.5) / 5) * 100);
}

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

  // --- data quality ---------------------------------------------------------
  // disconnected: no token data at all (primary CoinGecko API failed, no stale cache)
  // partial     : token data present, but MVRV/Funding are approximated or market-data-service is in fallback mode
  // live        : token data + fearGreed + market-data-service all fresh
  const isDisconnected = !tokenData && !!tokenError;
  const isMvrvFallback = !marketData || !!(marketData as { fallback?: boolean }).fallback;
  const isFgFallback   = !fg && !!fgError;

  const dataQuality: DataQuality = isDisconnected
    ? 'disconnected'
    : (isMvrvFallback || isFgFallback)
      ? 'partial'
      : 'live';

  async function refetch() {
    await Promise.allSettled([
      refetchToken(), refetchFg(), refetchMa(),
      refetchMarket(), refetchAdv(),
    ]);
  }

  // --- metrics computation --------------------------------------------------
  let metrics: Record<OctToken, OctTokenMetrics>;

  if (!tokenData) {
    // Use neutral fallback so the chart always renders
    metrics = FALLBACK_METRICS;
  } else {
    const fgValue      = fg?.value ?? 50;
    const fgLive       = !!fg && !fgError;
    const fundingRate  = advMarket?.tradingMetrics?.fundingRate ?? 0;
    const fundingScore = fundingToScore(fundingRate);
    const fundingLive  = !!advMarket;

    metrics = (['BTC', 'ETH', 'SOL'] as OctToken[]).reduce((acc, sym) => {
      const t = tokenData.find(x => x.symbol === sym);
      if (!t) { acc[sym] = FALLBACK_METRICS[sym]; return acc; }

      // 200WMA: BTC actual, ETH/SOL proxy
      let wmaScore: number;
      let wmaLive: boolean;
      if (sym === 'BTC' && ma200) {
        wmaScore = wmaDistToScore(ma200.distancePct);
        wmaLive  = true;
      } else {
        wmaScore = clamp(50 - t.athChangePercentage * 0.3);
        wmaLive  = false;
      }

      // MVRV: BTC from market-data-service; ETH/SOL proxy
      let mvrvScore: number;
      let mvrvLive: boolean;
      if (sym === 'BTC' && !isMvrvFallback && marketData) {
        const livePrice     = prices?.bitcoin?.usd ?? marketData.btc?.price ?? 0;
        const realizedPrice = marketData.btc?.realizedPrice ?? 53600;
        mvrvScore = mvrvToScore(livePrice, realizedPrice);
        mvrvLive  = true;
      } else if (sym === 'BTC') {
        const livePrice     = prices?.bitcoin?.usd ?? 0;
        const realizedPrice = marketData?.btc?.realizedPrice ?? 53600;
        mvrvScore = mvrvToScore(livePrice, realizedPrice);
        mvrvLive  = false; // market-data-service in fallback
      } else {
        mvrvScore = clamp(50 - t.athChangePercentage * 0.28);
        mvrvLive  = false;
      }

      acc[sym] = {
        color: COLORS[sym],
        axes: [
          { axis: 'W-RSI',      value: clamp(t.rsi14),                                     live: true        },
          { axis: 'Macro MFI',  value: approxMFI(t.change24h, t.change7d),                 live: false       },
          { axis: 'Bollinger',  value: bollingerToScore(t.bollingerPosition),               live: true        },
          { axis: 'Fear/Greed', value: clamp(fgValue),                                     live: fgLive      },
          { axis: '200WMA',     value: wmaScore,                                            live: wmaLive     },
          { axis: 'On-chain',   value: approxOnchain(t.change30d, t.networkHealth),         live: false       },
          { axis: 'MVRV',       value: mvrvScore,                                           live: mvrvLive    },
          { axis: 'Funding',    value: fundingScore,                                        live: fundingLive },
        ],
      };
      return acc;
    }, {} as Record<OctToken, OctTokenMetrics>);
  }

  const liveCount = metrics[(['BTC', 'ETH', 'SOL'] as OctToken[])[0]].axes.filter(a => a.live).length;

  return { metrics, isLoading, dataQuality, liveCount, refetch };
}
