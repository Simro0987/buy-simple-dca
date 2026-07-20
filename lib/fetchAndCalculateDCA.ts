import type { DcaMarketSnapshot, FearGreedData } from "@/lib/dcaMarketData";
import {
  computeMasterDcaEngine,
  type MasterDcaResult,
} from "@/lib/masterDcaEngine";
import type { Transaction } from "@/lib/portfolioStorage";

type RawKline = [number, string, string, string, string, string, ...unknown[]];

const FEAR_GREED_FALLBACK: FearGreedData = {
  value: 50,
  label: "Neutral",
  classification: "Neutral",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeSma(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

function computeRsi14(prices: number[]): number {
  if (prices.length < 16) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= 14; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return clamp(100 - 100 / (1 + rs), 0, 100);
}

function computeAtr14Pct(prices: number[]): number {
  if (prices.length < 16) return 2;
  const trs: number[] = [];
  for (let i = prices.length - 14; i < prices.length; i++) {
    const pc = prices[i - 1];
    const tr = Math.abs(prices[i] - pc);
    if (pc > 0) trs.push((tr / pc) * 100);
  }
  return trs.length > 0
    ? trs.reduce((sum, v) => sum + v, 0) / trs.length
    : 2;
}

function computeTrendScore(prices: number[]): number {
  const price = prices[prices.length - 1];
  const sma50 = computeSma(prices, 50);
  const sma200 = computeSma(prices, 200);
  if (sma50 <= 0 || sma200 <= 0) return 50;
  const dist50 = ((price - sma50) / sma50) * 100;
  const dist200 = ((price - sma200) / sma200) * 100;
  return clamp(Math.round(50 - dist50 * 1.1 - dist200 * 0.4), 0, 100);
}

function computeMomentumScore(prices: number[]): number {
  if (prices.length < 15) return 50;
  const roc =
    ((prices[prices.length - 1] - prices[prices.length - 15]) /
      prices[prices.length - 15]) *
    100;
  const rsiScore = clamp(100 - computeRsi14(prices), 0, 100);
  const rocScore = clamp(50 - roc * 2.5, 0, 100);
  return Math.round((rsiScore + rocScore) / 2);
}

function computeRiskScore(prices: number[]): number {
  if (prices.length < 15) return 50;
  const slice = prices.slice(-14);
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.abs((slice[i] - slice[i - 1]) / slice[i - 1]));
  }
  const avgVol = (returns.reduce((sum, r) => sum + r, 0) / returns.length) * 100;
  return clamp(Math.round(100 - avgVol * 30), 0, 100);
}

const BINANCE_KLINES_BASE = "https://data-api.binance.vision/api/v3/klines";

async function fetchBinanceClosePricesServer(): Promise<number[]> {
  const res = await fetch(
    `${BINANCE_KLINES_BASE}?symbol=BTCUSDT&interval=1d&limit=250`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Binance klines unavailable");
  const data = (await res.json()) as RawKline[];
  return data.map((k) => parseFloat(k[4]));
}

async function fetchFearGreedIndexServer(): Promise<FearGreedData> {
  const res = await fetch("https://api.alternative.me/fng/?limit=1", {
    cache: "no-store",
  });
  if (!res.ok) return FEAR_GREED_FALLBACK;
  const json = (await res.json()) as {
    data?: Array<{ value: string; value_classification: string }>;
  };
  const entry = json.data?.[0];
  if (!entry) return FEAR_GREED_FALLBACK;
  return {
    value: Number(entry.value) || 50,
    label: entry.value_classification,
    classification: entry.value_classification,
  };
}

async function fetchBinanceClosePrices(): Promise<number[]> {
  const res = await fetch(
    `${BINANCE_KLINES_BASE}?symbol=BTCUSDT&interval=1d&limit=250`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Binance klines unavailable");
  const data = (await res.json()) as RawKline[];
  return data.map((k) => parseFloat(k[4]));
}

async function fetchFearGreedIndex(): Promise<FearGreedData> {
  const res = await fetch("https://api.alternative.me/fng/?limit=1", {
    cache: "no-store",
  });
  if (!res.ok) return FEAR_GREED_FALLBACK;
  const json = (await res.json()) as {
    data?: Array<{ value: string; value_classification: string }>;
  };
  const entry = json.data?.[0];
  if (!entry) return FEAR_GREED_FALLBACK;
  return {
    value: Number(entry.value) || 50,
    label: entry.value_classification,
    classification: entry.value_classification,
  };
}

async function fetchLiveInputsClient(): Promise<{
  prices: number[];
  fearGreed: FearGreedData;
}> {
  try {
    const [prices, fearGreed] = await Promise.all([
      fetchBinanceClosePrices(),
      fetchFearGreedIndex(),
    ]);
    if (prices.length < 50) throw new Error("Insufficient Binance data");
    return { prices, fearGreed };
  } catch {
    const res = await fetch("/api/dca/live", { cache: "no-store" });
    if (!res.ok) throw new Error("Live DCA data unavailable");
    const json = (await res.json()) as {
      success: boolean;
      prices?: number[];
      fearGreed?: FearGreedData;
      error?: string;
    };
    if (!json.success || !json.prices?.length || !json.fearGreed) {
      throw new Error(json.error ?? "Live DCA data unavailable");
    }
    return { prices: json.prices, fearGreed: json.fearGreed };
  }
}

export async function fetchLiveDcaInputs(): Promise<{
  prices: number[];
  fearGreed: FearGreedData;
}> {
  const [prices, fearGreed] = await Promise.all([
    fetchBinanceClosePricesServer(),
    fetchFearGreedIndexServer(),
  ]);
  if (prices.length < 50) throw new Error("Insufficient Binance data");
  return { prices, fearGreed };
}

function buildSnapshotFromPrices(
  prices: number[],
  fearGreed: FearGreedData,
): DcaMarketSnapshot {
  const currentPrice = prices[prices.length - 1];
  const sma200 = computeSma(prices, 200);
  const ema50 = computeSma(prices, 50);
  const rsi14 = computeRsi14(prices);
  const atr14Pct = computeAtr14Pct(prices);
  const mayerMultiple = sma200 > 0 ? currentPrice / sma200 : 1;

  return {
    fearGreed,
    marketData: {
      generatedAt: new Date().toISOString(),
      btc: {
        price: currentPrice,
        ma200d: sma200,
        ema50,
        ma200w: sma200,
        ma200wStale: false,
        mayerMultiple,
        atr14d: atr14Pct,
        rsi14,
      },
      eth: { atr14d: atr14Pct, rsi14 },
      sol: { tvl: 0, atr14d: atr14Pct * 1.5, rsi14 },
      unlocks: [],
      degraded: false,
      source: "binance",
    },
    tokens: {
      BTC: {
        symbol: "BTC",
        price: currentPrice,
        change24h: 0,
        marketCap: 0,
        hasLiveData: true,
      },
    },
    fetchedAt: new Date().toISOString(),
    degraded: false,
  };
}

export interface DcaLiveCalculation extends MasterDcaResult {
  valueScore: number;
  trendScore: number;
  momentumScore: number;
  riskScore: number;
  sentimentScore: number;
}

export async function fetchAndCalculateDCA(input: {
  weeklyBudget: number;
  portfolioSymbols?: string[];
  dcaTransactions?: Transaction[];
  tokenSnapshot?: DcaMarketSnapshot["tokens"];
}): Promise<DcaLiveCalculation> {
  const { prices, fearGreed } = await fetchLiveInputsClient();
  const snapshot = buildSnapshotFromPrices(prices, fearGreed);

  if (input.tokenSnapshot) {
    snapshot.tokens = { ...snapshot.tokens, ...input.tokenSnapshot };
    if (snapshot.tokens.BTC?.price) {
      snapshot.marketData.btc.price = snapshot.tokens.BTC.price;
    }
  }

  const currentPrice = prices[prices.length - 1];
  const sma200 = computeSma(prices, 200);
  const distancePct =
    sma200 > 0 ? ((currentPrice - sma200) / sma200) * 100 : 0;
  const valueScore = clamp(Math.round(50 - distancePct * 1.25), 0, 100);
  const sentimentScore = clamp(Math.round(100 - fearGreed.value), 0, 100);
  const trendScore = computeTrendScore(prices);
  const momentumScore = computeMomentumScore(prices);
  const riskScore = computeRiskScore(prices);

  const txData = (input.dcaTransactions ?? [])
    .filter((tx) => tx.type === "DCA")
    .map((tx) => ({
      symbol: tx.symbol,
      spentUsd: tx.spentUsd,
      priceUsd: tx.priceUsd,
      amount: tx.amount,
    }));

  const result = computeMasterDcaEngine({
    weeklyBudget: input.weeklyBudget,
    snapshot,
    portfolioSymbols: input.portfolioSymbols,
    dcaTransactions: txData,
  });

  return {
    ...result,
    degraded: false,
    confidence: "high",
    confidenceMultiplier: 1,
    valueScore,
    trendScore,
    momentumScore,
    riskScore,
    sentimentScore,
  };
}
