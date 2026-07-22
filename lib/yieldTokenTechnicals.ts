import { DCA_YIELD_TOKENS } from "@/lib/dcaMarketData";
import {
  clamp,
  computeAtr14Pct,
  computeRsi14,
  computeSma,
  lerpScore,
} from "@/lib/dcaTechnicalIndicators";
import type { YieldTokenMetrics } from "@/lib/dcaYieldFilter";
import { resolveYieldApy } from "@/lib/yieldDataSources";
import { fetchDefillamaApyMap } from "@/lib/yieldStakingFetch";

export interface YieldBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type RawKline = [number, string, string, string, string, string, ...unknown[]];

const BINANCE_KLINES_BASE = "https://data-api.binance.vision/api/v3/klines";

async function fetchKlines(
  symbol: string,
  interval = "1d",
  limit = 60,
): Promise<YieldBar[]> {
  const url = `${BINANCE_KLINES_BASE}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const json = (await res.json()) as RawKline[];
  return json.map((k) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

function computeFundamentalScore(
  bars: YieldBar[],
  rsi: number,
  priceVsSma14Pct: number,
): number {
  const volumes = bars.map((bar) => bar.volume).filter((volume) => volume > 0);

  let volumeScore = 55;
  if (volumes.length >= 30) {
    const vol7 =
      volumes.slice(-7).reduce((sum, volume) => sum + volume, 0) / 7;
    const vol30 =
      volumes.slice(-30).reduce((sum, volume) => sum + volume, 0) / 30;
    const volRatio = vol30 > 0 ? vol7 / vol30 : 1;
    volumeScore = lerpScore(volRatio, 0.6, 1.4, 35, 85);
  }

  const rsiScore = lerpScore(rsi, 15, 65, 90, 40);
  const smaScore = lerpScore(priceVsSma14Pct, -15, 10, 30, 80);

  return Math.round(
    clamp(volumeScore * 0.35 + rsiScore * 0.35 + smaScore * 0.3, 0, 100),
  );
}

export function buildYieldMetricsFromBars(
  coin: (typeof DCA_YIELD_TOKENS)[number],
  bars: YieldBar[],
): YieldTokenMetrics | null {
  if (bars.length < 16) return null;

  const closes = bars.map((bar) => bar.close);
  const price = closes[closes.length - 1];
  const sma14 = computeSma(closes, 14);
  if (price <= 0 || sma14 <= 0) return null;

  const rsi = Math.round(computeRsi14(closes) * 10) / 10;
  const priceVsSma14Pct =
    Math.round(((price / sma14 - 1) * 100) * 10) / 10;
  const atr14Pct = Math.round(computeAtr14Pct(bars) * 10) / 10;
  const fundamentalScore = computeFundamentalScore(
    bars,
    rsi,
    priceVsSma14Pct,
  );

  return {
    symbol: coin.symbol,
    name: coin.name,
    tag: coin.chainTag,
    rsi,
    price,
    sma14: Math.round(sma14 * 100) / 100,
    priceVsSma14Pct,
    fundamentalScore,
    atr14Pct,
    live: true,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchCoinGeckoDailyBars(
  coingeckoId: string,
  days = 60,
): Promise<YieldBar[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    prices?: [number, number][];
    total_volumes?: [number, number][];
  };

  const prices = json.prices ?? [];
  const volumes = json.total_volumes ?? [];

  return prices.map(([timestamp, close], index) => {
    const prevClose = index > 0 ? prices[index - 1][1] : close;
    const volume = volumes[index]?.[1] ?? 0;
    return {
      open: prevClose,
      high: Math.max(prevClose, close),
      low: Math.min(prevClose, close),
      close,
      volume,
    };
  });
}

export async function fetchYieldTokenMetrics(
  coin: (typeof DCA_YIELD_TOKENS)[number],
): Promise<YieldTokenMetrics | null> {
  try {
    if (coin.binanceSymbol) {
      const bars = await fetchKlines(coin.binanceSymbol, "1d", 60);
      const metrics = buildYieldMetricsFromBars(coin, bars);
      if (metrics) return metrics;
    }

    const cgBars = await fetchCoinGeckoDailyBars(coin.coingeckoId, 60);
    return buildYieldMetricsFromBars(coin, cgBars);
  } catch {
    return null;
  }
}

export type YieldMetricsMap = Record<string, YieldTokenMetrics>;

function attachResolvedApy(
  metrics: YieldTokenMetrics,
  defillamaApy: number | null | undefined,
): YieldTokenMetrics {
  const resolved = resolveYieldApy({
    symbol: metrics.symbol,
    category: "yield",
    defillamaApyPct: defillamaApy,
    atr14dPct: metrics.atr14Pct,
    fundamentalScore: metrics.fundamentalScore,
  });

  return {
    ...metrics,
    apyPct: resolved.apyPct,
    defillamaApyPct: defillamaApy,
    apySource: resolved.source,
    apyIsEstimated: resolved.isEstimated,
    apySourceLabel: resolved.sourceLabel,
  };
}

export async function fetchAllYieldTokenMetrics(): Promise<YieldMetricsMap> {
  const symbols = DCA_YIELD_TOKENS.map((coin) => coin.symbol);

  const [results, defillamaApyMap] = await Promise.all([
    Promise.all(
      DCA_YIELD_TOKENS.map(async (coin) => {
        const metrics = await fetchYieldTokenMetrics(coin);
        return [coin.symbol, metrics] as const;
      }),
    ),
    fetchDefillamaApyMap(symbols),
  ]);

  const map: YieldMetricsMap = {};
  for (const [symbol, metrics] of results) {
    if (!metrics) continue;
    map[symbol] = attachResolvedApy(metrics, defillamaApyMap[symbol]);
  }
  return map;
}
