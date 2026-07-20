import {
  clamp,
  computeAtr14Pct,
  computeSma,
  lerpScore,
  type OhlcBar,
} from "@/lib/dcaTechnicalIndicators";

const BINANCE_BASE = "https://data-api.binance.vision/api/v3";
const FNG_URL = "https://api.alternative.me/fng/?limit=1";
const COINGECKO_GLOBAL = "https://api.coingecko.com/api/v3/global";

type RawKline = [number, string, string, string, string, string, ...unknown[]];

export interface LiveMarketRegimeRawData {
  btcPrice: number;
  wma200: number;
  distWmaPct: number;
  fearGreed: number;
  fearGreedLabel: string;
  cbbcScore: number;
  liquidityUsd: number;
  atr14Pct: number;
  mayerMultiple: number;
  fetchedAt: string;
  degraded: boolean;
  sources: {
    wma200: string;
    fearGreed: string;
    cbbc: string;
    liquidity: string;
    volatility: string;
  };
}

interface VolumeBar extends OhlcBar {
  volume: number;
}

const FALLBACK: LiveMarketRegimeRawData = {
  btcPrice: 65_278,
  wma200: 63_100,
  distWmaPct: 3.46,
  fearGreed: 29,
  fearGreedLabel: "Fear",
  cbbcScore: 74,
  liquidityUsd: 4_900_000_000,
  atr14Pct: 1.6,
  mayerMultiple: 1.05,
  fetchedAt: new Date().toISOString(),
  degraded: true,
  sources: {
    wma200: "fallback",
    fearGreed: "fallback",
    cbbc: "fallback",
    liquidity: "fallback",
    volatility: "fallback",
  },
};

let lastGoodResult: LiveMarketRegimeRawData | null = null;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchKlines(
  interval: string,
  limit: number,
): Promise<VolumeBar[]> {
  const url = `${BINANCE_BASE}/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
  const json = await fetchJson<RawKline[]>(url);
  if (!json?.length) return [];

  return json.map((k) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function fetchBtcPrice(): Promise<number> {
  const ticker = await fetchJson<{ lastPrice?: string }>(
    `${BINANCE_BASE}/ticker/price?symbol=BTCUSDT`,
  );
  return ticker?.lastPrice ? parseFloat(ticker.lastPrice) : 0;
}

async function fetchBtcQuoteVolume(): Promise<number> {
  const ticker = await fetchJson<{ quoteVolume?: string }>(
    `${BINANCE_BASE}/ticker/24hr?symbol=BTCUSDT`,
  );
  return ticker?.quoteVolume ? parseFloat(ticker.quoteVolume) : 0;
}

function computeWma200(weeklyBars: VolumeBar[]): number {
  const completed = weeklyBars.slice(0, -1);
  const closes = completed.map((bar) => bar.close);
  if (closes.length >= 200) return computeSma(closes, 200);
  if (closes.length > 0) return computeSma(closes, closes.length);
  return 0;
}

function computeMayerMultiple(price: number, dailyBars: VolumeBar[]): number {
  const closes = dailyBars.map((bar) => bar.close);
  const sma200 = computeSma(closes, 200);
  return sma200 > 0 ? price / sma200 : 1.05;
}

function computeVolumeRatio(dailyBars: VolumeBar[]): number {
  const volumes = dailyBars.map((bar) => bar.volume).filter((v) => v > 0);
  if (volumes.length < 30) return 1;

  const vol7 =
    volumes.slice(-7).reduce((sum, volume) => sum + volume, 0) / 7;
  const vol30 =
    volumes.slice(-30).reduce((sum, volume) => sum + volume, 0) / 30;
  return vol30 > 0 ? vol7 / vol30 : 1;
}

function computeCbbcScore(input: {
  volumeRatio: number;
  mayerMultiple: number;
  distWmaPct: number;
  atr14Pct: number;
}): number {
  const volumeScore = lerpScore(input.volumeRatio, 0.6, 1.4, 35, 88);
  const mayerScore = lerpScore(input.mayerMultiple, 0.8, 2.2, 88, 25);
  const trendScore = lerpScore(input.distWmaPct, -25, 15, 85, 40);
  const volScore = lerpScore(input.atr14Pct, 0.5, 8, 80, 35);

  return Math.round(
    clamp(
      volumeScore * 0.3 +
        mayerScore * 0.35 +
        trendScore * 0.2 +
        volScore * 0.15,
      0,
      100,
    ),
  );
}

async function fetchFearGreed(): Promise<{
  value: number;
  label: string;
} | null> {
  const json = await fetchJson<{
    data?: Array<{ value: string; value_classification: string }>;
  }>(FNG_URL);
  const entry = json?.data?.[0];
  if (!entry) return null;

  return {
    value: Number(entry.value) || 50,
    label: entry.value_classification || "Neutral",
  };
}

async function fetchCoinGeckoLiquidity(): Promise<number | null> {
  const json = await fetchJson<{
    data?: {
      total_market_cap?: { usd?: number };
      total_volume?: { usd?: number };
      market_cap_percentage?: Record<string, number>;
    };
  }>(COINGECKO_GLOBAL);

  const data = json?.data;
  if (!data) return null;

  const totalCap = data.total_market_cap?.usd ?? 0;
  const usdtPct = data.market_cap_percentage?.usdt ?? 0;
  const usdcPct = data.market_cap_percentage?.usdc ?? 0;
  const stableUsd = ((usdtPct + usdcPct) / 100) * totalCap;

  if (stableUsd > 0) return stableUsd;

  const totalVolume = data.total_volume?.usd ?? 0;
  return totalVolume > 0 ? totalVolume : null;
}

export async function fetchLiveMarketRegimeFactors(): Promise<LiveMarketRegimeRawData> {
  const [weeklyBars, dailyBars, priceFromTicker, fearGreed, liquidityCg, quoteVol] =
    await Promise.all([
      fetchKlines("1w", 210),
      fetchKlines("1d", 250),
      fetchBtcPrice(),
      fetchFearGreed(),
      fetchCoinGeckoLiquidity(),
      fetchBtcQuoteVolume(),
    ]);

  const base = lastGoodResult ?? FALLBACK;
  let degraded = false;

  const price =
    priceFromTicker > 0
      ? priceFromTicker
      : dailyBars.at(-1)?.close ?? base.btcPrice;
  if (price <= 0) degraded = true;

  const wma200 =
    weeklyBars.length > 0 ? computeWma200(weeklyBars) : base.wma200;
  const distWmaPct =
    wma200 > 0
      ? Math.round(((price - wma200) / wma200) * 10000) / 100
      : base.distWmaPct;
  if (weeklyBars.length === 0) degraded = true;

  const atr14Pct =
    dailyBars.length >= 16
      ? Math.round(computeAtr14Pct(dailyBars) * 10) / 10
      : base.atr14Pct;
  if (dailyBars.length < 16) degraded = true;

  const mayerMultiple =
    dailyBars.length >= 200
      ? Math.round(computeMayerMultiple(price, dailyBars) * 100) / 100
      : base.mayerMultiple;

  const volumeRatio =
    dailyBars.length >= 30 ? computeVolumeRatio(dailyBars) : 1;

  const cbbcScore = computeCbbcScore({
    volumeRatio,
    mayerMultiple,
    distWmaPct,
    atr14Pct,
  });

  const liquidityUsd =
    quoteVol > 0
      ? quoteVol
      : liquidityCg && liquidityCg > 0
        ? liquidityCg
        : base.liquidityUsd;

  const result: LiveMarketRegimeRawData = {
    btcPrice: price,
    wma200,
    distWmaPct,
    fearGreed: fearGreed?.value ?? base.fearGreed,
    fearGreedLabel: fearGreed?.label ?? base.fearGreedLabel,
    cbbcScore,
    liquidityUsd,
    atr14Pct,
    mayerMultiple,
    fetchedAt: new Date().toISOString(),
    degraded,
    sources: {
      wma200: weeklyBars.length > 0 ? "binance" : "fallback",
      fearGreed: fearGreed ? "alternative.me" : "fallback",
      cbbc: dailyBars.length >= 16 ? "binance-composite" : "fallback",
      liquidity:
        quoteVol > 0
          ? "binance-24h"
          : liquidityCg && liquidityCg > 0
            ? "coingecko-global"
            : "fallback",
      volatility: dailyBars.length >= 16 ? "binance" : "fallback",
    },
  };

  if (!fearGreed) degraded = true;
  if (!liquidityCg && quoteVol <= 0) degraded = true;

  result.degraded = degraded;
  lastGoodResult = result;
  return result;
}

export function getCachedMarketRegimeFactors(): LiveMarketRegimeRawData | null {
  return lastGoodResult;
}
