export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
}

export interface SymbolTechnicals {
  symbol: string;
  price: number;
  ma200w: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  atr14Pct: number;
  mayerMultiple: number;
  stale: boolean;
}

export interface BtcTechnicalsBundle {
  btc: SymbolTechnicals;
  eth: Pick<SymbolTechnicals, "symbol" | "rsi14" | "atr14Pct">;
  sol: Pick<SymbolTechnicals, "symbol" | "rsi14" | "atr14Pct">;
  generatedAt: string;
}

type RawKline = [number, string, string, string, string, string, ...unknown[]];

const FALLBACK_BTC: SymbolTechnicals = {
  symbol: "BTCUSDT",
  price: 0,
  ma200w: 48500,
  ema50: 0,
  ema200: 0,
  rsi14: 50,
  atr14Pct: 2.0,
  mayerMultiple: 1.15,
  stale: true,
};

async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number,
): Promise<OhlcBar[]> {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const json = (await res.json()) as RawKline[];
  return json.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

function computeEma(values: number[], period: number): number {
  if (values.length < period) return 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeSma(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

function computeRsi14(closes: number[]): number {
  if (closes.length < 16) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.max(0, Math.min(100, 100 - 100 / (1 + rs)));
}

function computeAtr14Pct(bars: OhlcBar[]): number {
  if (bars.length < 16) return 2.0;
  const trs: number[] = [];
  for (let i = Math.max(1, bars.length - 14); i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (pc > 0) trs.push((tr / pc) * 100);
  }
  if (trs.length === 0) return 2.0;
  return trs.reduce((sum, v) => sum + v, 0) / trs.length;
}

async function buildSymbolTechnicals(
  symbol: string,
): Promise<SymbolTechnicals> {
  const [daily, weekly] = await Promise.all([
    fetchKlines(symbol, "1d", 250),
    fetchKlines(symbol, "1w", 210),
  ]);

  if (daily.length < 50) {
    return { ...FALLBACK_BTC, symbol, stale: true };
  }

  const closes = daily.map((b) => b.close);
  const price = closes[closes.length - 1];
  const ema50 = computeEma(closes, 50);
  const ema200 = computeEma(closes, 200);
  const rsi14 = computeRsi14(closes);
  const atr14Pct = computeAtr14Pct(daily);

  const weeklyCloses = weekly.slice(0, -1).map((b) => b.close);
  const ma200w =
    weeklyCloses.length >= 200
      ? computeSma(weeklyCloses, 200)
      : computeSma(weeklyCloses, weeklyCloses.length);

  const mayerMultiple = ema200 > 0 ? price / ema200 : 1.15;

  return {
    symbol,
    price,
    ma200w: ma200w || price,
    ema50,
    ema200,
    rsi14,
    atr14Pct,
    mayerMultiple,
    stale: daily.length < 200,
  };
}

export async function fetchBinanceTechnicals(): Promise<BtcTechnicalsBundle> {
  try {
    const [btc, ethDaily, solDaily] = await Promise.all([
      buildSymbolTechnicals("BTCUSDT"),
      fetchKlines("ETHUSDT", "1d", 125),
      fetchKlines("SOLUSDT", "1d", 125),
    ]);

    const ethCloses = ethDaily.map((b) => b.close);
    const solCloses = solDaily.map((b) => b.close);

    return {
      btc,
      eth: {
        symbol: "ETHUSDT",
        rsi14: computeRsi14(ethCloses),
        atr14Pct: computeAtr14Pct(ethDaily),
      },
      sol: {
        symbol: "SOLUSDT",
        rsi14: computeRsi14(solCloses),
        atr14Pct: computeAtr14Pct(solDaily),
      },
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      btc: FALLBACK_BTC,
      eth: { symbol: "ETHUSDT", rsi14: 50, atr14Pct: 2.8 },
      sol: { symbol: "SOLUSDT", rsi14: 50, atr14Pct: 4.2 },
      generatedAt: new Date().toISOString(),
    };
  }
}

export function technicalsToMarketPayload(
  bundle: BtcTechnicalsBundle,
): import("@/lib/dcaMarketData").MarketDataServicePayload {
  const { btc, eth, sol } = bundle;
  return {
    generatedAt: bundle.generatedAt,
    btc: {
      ma200w: btc.ma200w,
      ma200wStale: btc.stale,
      mayerMultiple: btc.mayerMultiple,
      ma200d: btc.ema200,
      ema50: btc.ema50,
      price: btc.price,
      atr14d: btc.atr14Pct,
      rsi14: btc.rsi14,
    },
    eth: { atr14d: eth.atr14Pct, rsi14: eth.rsi14 },
    sol: { tvl: 0, atr14d: sol.atr14Pct, rsi14: sol.rsi14 },
    unlocks: [],
    degraded: false,
    source: "binance",
  };
}
