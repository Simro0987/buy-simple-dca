import type { DcaMarketSnapshot, FearGreedData } from "@/lib/dcaMarketData";
import {
  computeMasterDcaEngine,
  type MasterDcaResult,
} from "@/lib/masterDcaEngine";
import type { Transaction } from "@/lib/portfolioStorage";
import { buildMarketTechnicals } from "@/lib/dcaScoringEngine";
import type { OhlcBar } from "@/lib/dcaTechnicalIndicators";
import { computeUltimateDca } from "@/lib/ultimateDcaEngine";

type RawKline = [number, string, string, string, string, string, ...unknown[]];

const BINANCE_KLINES_BASE = "https://data-api.binance.vision/api/v3/klines";

const FEAR_GREED_FALLBACK: FearGreedData = {
  value: 50,
  label: "Neutral",
  classification: "Neutral",
};

function parseKlines(data: RawKline[]): OhlcBar[] {
  return data.map((k) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

async function fetchDailyBars(limit = 1500): Promise<OhlcBar[]> {
  const res = await fetch(
    `${BINANCE_KLINES_BASE}?symbol=BTCUSDT&interval=1d&limit=${limit}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Binance daily klines unavailable");
  const data = (await res.json()) as RawKline[];
  return parseKlines(data);
}

async function fetchWeeklyCloses(limit = 210): Promise<number[]> {
  const res = await fetch(
    `${BINANCE_KLINES_BASE}?symbol=BTCUSDT&interval=1w&limit=${limit}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("Binance weekly klines unavailable");
  const data = (await res.json()) as RawKline[];
  return data.slice(0, -1).map((k) => parseFloat(k[4]));
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

async function fetchMarketDataClient(): Promise<{
  dailyBars: OhlcBar[];
  weeklyCloses: number[];
  fearGreed: FearGreedData;
}> {
  try {
    const [dailyBars, weeklyCloses, fearGreed] = await Promise.all([
      fetchDailyBars(1500),
      fetchWeeklyCloses(210),
      fetchFearGreedIndex(),
    ]);
    if (dailyBars.length < 200) throw new Error("Insufficient daily data");
    return { dailyBars, weeklyCloses, fearGreed };
  } catch {
    const res = await fetch("/api/dca/live", { cache: "no-store" });
    if (!res.ok) throw new Error("Live DCA data unavailable");
    const json = (await res.json()) as {
      success: boolean;
      dailyBars?: OhlcBar[];
      weeklyCloses?: number[];
      fearGreed?: FearGreedData;
      error?: string;
    };
    if (!json.success || !json.dailyBars?.length || !json.fearGreed) {
      throw new Error(json.error ?? "Live DCA data unavailable");
    }
    return {
      dailyBars: json.dailyBars,
      weeklyCloses: json.weeklyCloses ?? [],
      fearGreed: json.fearGreed,
    };
  }
}

export async function fetchLiveDcaInputs(): Promise<{
  dailyBars: OhlcBar[];
  weeklyCloses: number[];
  fearGreed: FearGreedData;
}> {
  const [dailyBars, weeklyCloses, fearGreed] = await Promise.all([
    fetchDailyBars(1500),
    fetchWeeklyCloses(210),
    fetchFearGreedIndex(),
  ]);
  if (dailyBars.length < 200) throw new Error("Insufficient Binance data");
  return { dailyBars, weeklyCloses, fearGreed };
}

function buildSnapshot(
  dailyBars: OhlcBar[],
  weeklyCloses: number[],
  fearGreed: FearGreedData,
): DcaMarketSnapshot {
  const indicators = buildMarketTechnicals(dailyBars, weeklyCloses);

  return {
    fearGreed,
    marketData: {
      generatedAt: new Date().toISOString(),
      btc: {
        price: indicators.price,
        ma200d: indicators.sma200d,
        ema50: indicators.ema50,
        ma200w: indicators.wma200w,
        ma200wStale: false,
        mayerMultiple:
          indicators.sma200d > 0
            ? indicators.price / indicators.sma200d
            : 1,
        atr14d: indicators.atr14Pct,
        rsi14: indicators.rsi14,
      },
      eth: { atr14d: indicators.atr14Pct, rsi14: indicators.rsi14 },
      sol: { tvl: 0, atr14d: indicators.atr14Pct * 1.5, rsi14: indicators.rsi14 },
      unlocks: [],
      degraded: false,
      source: "binance",
    },
    tokens: {
      BTC: {
        symbol: "BTC",
        price: indicators.price,
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
  finalScoreRaw: number;
}

export async function fetchAndCalculateDCA(input: {
  weeklyBudget: number;
  portfolioSymbols?: string[];
  dcaTransactions?: Transaction[];
  tokenSnapshot?: DcaMarketSnapshot["tokens"];
}): Promise<DcaLiveCalculation> {
  const { dailyBars, weeklyCloses, fearGreed } =
    await fetchMarketDataClient();

  const ultimate = computeUltimateDca({
    dailyBars,
    weeklyCloses,
    sentiment: fearGreed.value,
    sentimentLabel: fearGreed.classification,
    weeklyBudget: input.weeklyBudget,
  });

  const snapshot = buildSnapshot(dailyBars, weeklyCloses, fearGreed);

  if (input.tokenSnapshot) {
    snapshot.tokens = { ...snapshot.tokens, ...input.tokenSnapshot };
    if (snapshot.tokens.BTC?.price) {
      snapshot.marketData.btc.price = snapshot.tokens.BTC.price;
    }
  }

  const txData = (input.dcaTransactions ?? [])
    .filter((tx) => tx.type === "DCA")
    .map((tx) => ({
      symbol: tx.symbol,
      spentUsd: tx.spentUsd,
      priceUsd: tx.priceUsd,
      amount: tx.amount,
    }));

  const tokenResult = computeMasterDcaEngine({
    weeklyBudget: input.weeklyBudget,
    snapshot,
    portfolioSymbols: input.portfolioSymbols,
    dcaTransactions: txData,
  });

  const totalWeight = tokenResult.tokenPlans.reduce(
    (sum, plan) => sum + plan.weightPercent,
    0,
  );

  const tokenPlans = tokenResult.tokenPlans.map((plan) => {
    const weightNorm =
      totalWeight > 0 ? plan.weightPercent / totalWeight : 0;
    const totalUsd =
      Math.round(ultimate.deployedCapital * weightNorm * 100) / 100;
    const marketUsd =
      Math.round(totalUsd * (plan.marketShare / 100) * 100) / 100;
    const limitUsd = Math.round((totalUsd - marketUsd) * 100) / 100;
    return { ...plan, totalUsd, marketUsd, limitUsd };
  });

  return {
    ...tokenResult,
    moneyMode:
      ultimate.regime === "CAPITULATION"
        ? "CAPITULATION"
        : ultimate.regime === "EUPHORIA"
          ? "EUPHORIA"
          : ultimate.regime === "BEAR"
            ? "ACCUMULATION"
            : "NEUTRAL",
    confluenceScore: ultimate.finalScoreDisplay,
    finalScoreRaw: ultimate.finalScoreRaw,
    factors: ultimate.factors,
    baseAllocationPercent: ultimate.baseAllocationDisplay,
    allocationPercent: ultimate.allocationDisplay,
    confidence: ultimate.confidence,
    confidenceMultiplier: ultimate.confidenceMultiplier,
    regimeKey:
      ultimate.regime === "EUPHORIA"
        ? "EUFÓRIA"
        : ultimate.regime === "CAPITULATION"
          ? "PANIC"
          : ultimate.regime,
    regimeLabel: ultimate.regimeLabel,
    regimeDescription: ultimate.regimeDescription,
    fearGreedValue: fearGreed.value,
    brakeActive: ultimate.brakeActive,
    degraded: false,
    capitalPipeline: {
      aWeeklyBudget: input.weeklyBudget,
      bConfluenceScore: ultimate.finalScoreDisplay,
      cAllocationPercent: ultimate.allocationDisplay,
      dDeployedCapital: ultimate.deployedCapital,
      eReserveCapital: ultimate.reserveCapital,
    },
    tokenPlans,
  };
}
