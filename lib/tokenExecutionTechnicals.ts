import { ALL_DCA_TOKENS } from "@/lib/dcaMarketData";
import {
  BINANCE_KLINE_LIMIT,
  fetchBinanceKlines,
  type OhlcBar,
} from "@/lib/market-data/fetchKlines";
import {
  computeAtr14Pct,
  computeChange24hPct,
  computeDailyAtrPct,
  computeEma,
  computeRsi14,
  computeSma,
} from "@/lib/dcaTechnicalIndicators";
import { detectMacroTrend, type MacroTrend } from "@/lib/macroTrend";
import { detectShortTermTrend, type ShortTermTrend } from "@/lib/shortTermTrend";

export interface TokenExecutionTechnicals {
  symbol: string;
  price: number;
  rsi14: number;
  atr14dPct: number;
  dailyAtrPct: number;
  change24hPct: number;
  ema21: number;
  ema50: number;
  sma14: number;
  sma200: number;
  macroTrend: MacroTrend | null;
  shortTermTrend: ShortTermTrend | null;
  support1: number | null;
  support2: number | null;
  support1Source: string;
  support2Source: string;
  live: boolean;
  fetchedAt: string;
}

export type TokenExecutionTechnicalsMap = Record<string, TokenExecutionTechnicals>;

const PIVOT_LOOKBACK = 2;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function findPivotLows(bars: OhlcBar[]): Array<{ price: number; index: number }> {
  const pivots: Array<{ price: number; index: number }> = [];

  for (let i = PIVOT_LOOKBACK; i < bars.length - PIVOT_LOOKBACK; i++) {
    const low = bars[i].low;
    let isPivot = true;

    for (let j = 1; j <= PIVOT_LOOKBACK; j++) {
      if (bars[i - j].low <= low || bars[i + j].low <= low) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) {
      pivots.push({ price: low, index: i });
    }
  }

  return pivots;
}

function pickSupportsFromBars(
  spot: number,
  bars: OhlcBar[],
  ema50: number,
  sma14: number,
  sma200: number,
): {
  support1: number | null;
  support2: number | null;
  support1Source: string;
  support2Source: string;
} {
  const candidates: Array<{ price: number; source: string }> = [];

  for (const pivot of findPivotLows(bars)) {
    candidates.push({ price: pivot.price, source: "Pivot Low" });
  }

  if (ema50 > 0) candidates.push({ price: ema50, source: "EMA50" });
  if (sma14 > 0) candidates.push({ price: sma14, source: "SMA14" });
  if (sma200 > 0) candidates.push({ price: sma200, source: "SMA200" });

  const below = candidates
    .filter((candidate) => candidate.price > 0 && candidate.price < spot * 0.998)
    .sort((a, b) => b.price - a.price);

  const uniqueBelow: Array<{ price: number; source: string }> = [];
  for (const candidate of below) {
    const duplicate = uniqueBelow.some(
      (entry) => Math.abs(entry.price - candidate.price) / spot < 0.003,
    );
    if (!duplicate) uniqueBelow.push(candidate);
  }

  return {
    support1: uniqueBelow[0]?.price ?? null,
    support2: uniqueBelow[1]?.price ?? null,
    support1Source: uniqueBelow[0]?.source ?? "—",
    support2Source: uniqueBelow[1]?.source ?? "—",
  };
}

export function buildTokenExecutionTechnicalsFromBars(
  symbol: string,
  bars: OhlcBar[],
): TokenExecutionTechnicals | null {
  if (bars.length < 200) return null;

  const recentBars = bars.slice(-BINANCE_KLINE_LIMIT);
  const closes = recentBars.map((bar) => bar.close);
  const price = closes[closes.length - 1];
  if (price <= 0) return null;

  const rsi14 = round1(computeRsi14(closes));
  const atr14dPct = round1(computeAtr14Pct(recentBars));
  const dailyAtrPct = round1(computeDailyAtrPct(recentBars));
  const change24hPct = round1(computeChange24hPct(recentBars));
  const ema21 = round2(computeEma(closes, 21));
  const ema50 = round2(computeEma(closes, 50));
  const sma14 = round2(computeSma(closes, 14));
  const sma200 = round2(computeSma(closes, 200));
  const macroTrend = detectMacroTrend(price, sma200);
  const shortTermTrend = detectShortTermTrend(price, ema21, atr14dPct);
  const supports = pickSupportsFromBars(price, recentBars, ema50, sma14, sma200);

  return {
    symbol,
    price,
    rsi14,
    atr14dPct,
    dailyAtrPct,
    change24hPct,
    ema21,
    ema50,
    sma14,
    sma200,
    macroTrend,
    shortTermTrend,
    support1: supports.support1 ? round2(supports.support1) : null,
    support2: supports.support2 ? round2(supports.support2) : null,
    support1Source: supports.support1Source,
    support2Source: supports.support2Source,
    live: true,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchCoinGeckoDailyBars(
  coingeckoId: string,
  days = BINANCE_KLINE_LIMIT,
): Promise<OhlcBar[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];

  const json = (await res.json()) as { prices?: [number, number][] };
  const prices = json.prices ?? [];

  return prices.map(([timestamp, close], index) => {
    const prevClose = index > 0 ? prices[index - 1][1] : close;
    return {
      openTime: timestamp,
      open: prevClose,
      high: Math.max(prevClose, close),
      low: Math.min(prevClose, close),
      close,
      volume: 0,
    };
  });
}

export async function fetchTokenExecutionTechnicals(
  symbol: string,
): Promise<TokenExecutionTechnicals | null> {
  const token = ALL_DCA_TOKENS.find((entry) => entry.symbol === symbol);
  if (!token) return null;

  try {
    if (token.binanceSymbol) {
      const bars = await fetchBinanceKlines(
        token.binanceSymbol,
        "1d",
        BINANCE_KLINE_LIMIT,
      );
      const technicals = buildTokenExecutionTechnicalsFromBars(symbol, bars);
      if (technicals) return technicals;
    }

    const cgBars = await fetchCoinGeckoDailyBars(token.coingeckoId, BINANCE_KLINE_LIMIT);
    return buildTokenExecutionTechnicalsFromBars(symbol, cgBars);
  } catch {
    return null;
  }
}

export async function fetchAllTokenExecutionTechnicals(
  symbols?: string[],
): Promise<TokenExecutionTechnicalsMap> {
  const targetSymbols =
    symbols ??
    ALL_DCA_TOKENS.map((token) => token.symbol);

  const results = await Promise.all(
    targetSymbols.map(async (symbol) => {
      const technicals = await fetchTokenExecutionTechnicals(symbol);
      return [symbol, technicals] as const;
    }),
  );

  const map: TokenExecutionTechnicalsMap = {};
  for (const [symbol, technicals] of results) {
    if (technicals) map[symbol] = technicals;
  }
  return map;
}
