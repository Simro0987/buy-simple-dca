import { useTokenAnalysis } from './useTokenAnalysis';
import { useFearGreed } from './usePrices';
import { useBtc200dMA } from './useBtc200dMA';

export type HexToken = 'BTC' | 'ETH' | 'SOL';

export interface AxisPoint { axis: string; value: number }
export interface HexTokenMetrics { axes: AxisPoint[]; color: string }

const COLORS: Record<HexToken, string> = {
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

/** Approximate MFI from price momentum (no per-candle volume in sparkline) */
function approxMFI(change24h: number, change7d: number): number {
  return clamp(50 + change24h * 2.2 + change7d * 0.7);
}

/** Map 200WMA deviation % → 0-100 */
function wmaDistToScore(distPct: number): number {
  return clamp(50 + distPct * 0.55);
}

/** On-chain momentum proxy: 30d momentum + network health */
function approxOnchain(change30d: number, health: 'strong' | 'moderate' | 'weak'): number {
  const base = clamp((change30d + 35) / 70 * 100);
  const bonus = health === 'strong' ? 8 : health === 'weak' ? -8 : 0;
  return clamp(base + bonus);
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

  const isLoading = tokenLoading || fgLoading || maLoading;
  const hasError = !!(tokenError && fgError);

  async function refetch() {
    await Promise.allSettled([refetchToken(), refetchFg(), refetchMa()]);
  }

  let metrics: Record<HexToken, HexTokenMetrics> | undefined;

  if (tokenData) {
    const fgValue = fg?.value ?? 50;
    const tokens: HexToken[] = ['BTC', 'ETH', 'SOL'];

    metrics = tokens.reduce((acc, sym) => {
      const t = tokenData.find(x => x.symbol === sym);
      if (!t) return acc;

      // 200WMA score: BTC uses actual MA data; ETH/SOL approximate via ATH deviation
      let wmaScore: number;
      if (sym === 'BTC' && ma200) {
        wmaScore = wmaDistToScore(ma200.distancePct);
      } else {
        // athChangePercentage is negative (e.g. -40 = 40% below ATH = cheap)
        // below ATH → low score; at/above ATH → high score
        wmaScore = clamp(50 - t.athChangePercentage * 0.3);
      }

      acc[sym] = {
        color: COLORS[sym],
        axes: [
          { axis: 'RSI',          value: clamp(t.rsi14) },
          { axis: 'MFI',          value: approxMFI(t.change24h, t.change7d) },
          { axis: 'Bollinger',    value: bollingerToScore(t.bollingerPosition) },
          { axis: 'Fear & Greed', value: clamp(fgValue) },
          { axis: '200WMA',       value: wmaScore },
          { axis: 'On-chain',     value: approxOnchain(t.change30d, t.networkHealth) },
        ],
      };
      return acc;
    }, {} as Record<HexToken, HexTokenMetrics>);
  }

  return { metrics, isLoading, hasError, refetch };
}
