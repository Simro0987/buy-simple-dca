import { useBtcIndicators } from '@/hooks/useBtcIndicators';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchTokenPrice } from '@/lib/apiManager';
import { cgFetch } from '@/lib/coingecko';
import { fetchFundamentals, type FundamentalMetricsMap } from '@/lib/fundamentalsApi';
import { computePortfolioPnl, pnlPctMap } from '@/lib/portfolioHoldings';
import { useEffectiveHoldings } from '@/hooks/useEffectiveHoldings';
import { useLivePortfolioPrices, mergePrices } from '@/hooks/useLivePortfolioPrices';
import { useHiddenTokens } from '@/lib/hiddenPortfolioTokens';
import { isTokenRemovedNow } from '@/lib/dcaTokenVisibility';

import {
  HARVEST_TOKENS, type HarvestToken, type HarvestInput, type HarvestVerdict,
  computeHarvest, checkWbtcRisk, contrarianCheck, type WbtcRiskReport,
} from '@/lib/harvestEngine';

interface Daily {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  degraded: boolean;
}

const PAIR: Record<HarvestToken, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', HYPE: 'HYPEUSDT',
  AAVE: 'AAVEUSDT', LINK: 'LINKUSDT',
};

function sma(v: number[], p: number) { const s = v.slice(-p); return s.reduce((a, b) => a + b, 0) / (s.length || 1); }

function ema(v: number[], p: number) {
  const s = v.slice(-(p * 3));
  if (!s.length) return 0;
  const k = 2 / (p + 1);
  let e = s[0];
  for (let i = 1; i < s.length; i++) e = s[i] * k + e * (1 - k);
  return e;
}

function rsiWilder(closes: number[], period = 14) {
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 99;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(highs: number[], lows: number[], closes: number[], period = 14) {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const s = trs.slice(-period);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
}

async function loadDaily(token: HarvestToken): Promise<Daily> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${PAIR[token]}&interval=1d&limit=365`);
    if (!res.ok) throw new Error(String(res.status));
    const rows = await res.json() as Array<[number, string, string, string, string, string, ...unknown[]]>;
    const closes = rows.map(r => Number(r[4]));
    if (closes.filter(n => Number.isFinite(n) && n > 0).length < 40) throw new Error('short history');
    return {
      closes,
      highs: rows.map(r => Number(r[2])),
      lows: rows.map(r => Number(r[3])),
      volumes: rows.map(r => Number(r[5])),
      degraded: false,
    };
  } catch {
    const price = await fetchTokenPrice(token).catch(() => 0);
    const p = Number.isFinite(price) && price > 0 ? price : 0;
    return { closes: p ? [p] : [], highs: p ? [p] : [], lows: p ? [p] : [], volumes: [0], degraded: true };
  }
}

function pctChange(closes: number[], back: number) {
  if (closes.length < 2) return 0;
  const past = closes[Math.max(0, closes.length - 1 - back)];
  const last = closes[closes.length - 1];
  return past > 0 ? ((last - past) / past) * 100 : 0;
}

export interface HarvestData {
  prices: Record<HarvestToken, number>;
  fundamentals: FundamentalMetricsMap | null;
  verdicts: Record<HarvestToken, HarvestVerdict>;
  inputs: Record<HarvestToken, HarvestInput>;
  wbtcRisk: WbtcRiskReport;
  contrarian: string;
}

/** Live multi-factor harvest scores for all active tokens. */
export function useHarvestScores(fearGreed = 50) {
  const { data: livePrices } = useLivePortfolioPrices();
  const holdings = useEffectiveHoldings(livePrices);
  const { data: btcInd } = useBtcIndicators();
  const mvrvZ = btcInd?.mvrv.z ?? null;
  // Odstránené tokeny → žiadne sviečky, žiadny polling, žiadne skóre.
  const hiddenKey = useHiddenTokens().join(',');

  const query = useQuery({
    queryKey: ['harvest-daily', hiddenKey],
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const daily = {} as Record<HarvestToken, Daily>;
      const empty: Daily = { closes: [], highs: [], lows: [], volumes: [], degraded: true };
      const results = await Promise.all(HARVEST_TOKENS.map(async t => [
        t,
        isTokenRemovedNow(t, t.toLowerCase()) ? empty : await loadDaily(t),
      ] as const));
      for (const [t, d] of results) daily[t] = d;

      // MVRV proxy from live candles (price / 365D average) — no mock numbers.
      const priceToYearAvg: Partial<Record<HarvestToken, number>> = {};
      for (const t of HARVEST_TOKENS) {
        const c = daily[t].closes;
        if (c.length >= 60) {
          const yearAvg = sma(c, 365);
          const last = c[c.length - 1];
          if (yearAvg > 0 && last > 0) priceToYearAvg[t] = last / yearAvg;
        }
      }

      // Live spot from the same free candles — feeds the 200W-SMA MVRV proxy.
      const spot: Partial<Record<HarvestToken, number>> = {};
      for (const t of HARVEST_TOKENS) {
        const c = daily[t].closes;
        const last = c[c.length - 1];
        if (Number.isFinite(last) && last > 0) spot[t] = last;
      }

      // Live fundamentals — 100 % free sources (DefiLlama + CoinGecko + Binance).
      const fundamentals = await fetchFundamentals(priceToYearAvg, spot).catch(() => null);

      let wbtcPrice = 0;
      try {
        const res = await cgFetch('/simple/price', { ids: 'wrapped-bitcoin', vs_currencies: 'usd' });
        if (res.ok) {
          const j = await res.json() as Record<string, { usd?: number }>;
          wbtcPrice = Number(j['wrapped-bitcoin']?.usd ?? 0);
        }
      } catch { /* peg check falls back to warn */ }

      return { daily, wbtcPrice, fundamentals };
    },
  });

  const data: HarvestData | null = useMemo(() => {
    if (!query.data) return null;
    const { daily, wbtcPrice, fundamentals } = query.data;

    const btc = daily.BTC;
    const btcChange30 = pctChange(btc.closes, 30);
    const btcSma200 = btc.closes.length >= 200 ? sma(btc.closes, 200) : 0;
    const btcPrice = btc.closes[btc.closes.length - 1] ?? 0;
    const btcSmaDistPct = btcSma200 > 0 ? ((btcPrice - btcSma200) / btcSma200) * 100 : 0;
    const btcAtrPct = btcPrice > 0 ? (atr(btc.highs, btc.lows, btc.closes) / btcPrice) * 100 : 0;

    const inputs = {} as Record<HarvestToken, HarvestInput>;
    const verdicts = {} as Record<HarvestToken, HarvestVerdict>;
    const closePrices = {} as Record<HarvestToken, number>;
    for (const t of HARVEST_TOKENS) {
      const c = daily[t].closes;
      closePrices[t] = c[c.length - 1] ?? 0;
    }
    // Live spot overrides any missing candle close so PnL is never $0 by accident.
    const prices = mergePrices(closePrices, livePrices);


    // Real unrealized PnL per token from the user's configured holdings.
    const pnl = pnlPctMap(computePortfolioPnl(holdings, prices));

    for (const token of HARVEST_TOKENS) {
      const d = daily[token];
      const price = prices[token] || (d.closes[d.closes.length - 1] ?? 0);
      const s200 = d.closes.length >= 200 ? sma(d.closes, 200) : d.closes.length > 20 ? sma(d.closes, d.closes.length) : 0;
      const a = atr(d.highs, d.lows, d.closes);
      const recentVol = d.volumes.slice(-7);
      const priorVol = d.volumes.slice(-37, -7);
      const rv = recentVol.length ? recentVol.reduce((x, y) => x + y, 0) / recentVol.length : 0;
      const pv = priorVol.length ? priorVol.reduce((x, y) => x + y, 0) / priorVol.length : 0;
      const high365 = d.highs.length ? Math.max(...d.highs) : price;

      const input: HarvestInput = {
        token,
        price,
        rsi14: rsiWilder(d.closes),
        sma200: s200,
        ema50: d.closes.length >= 50 ? ema(d.closes, 50) : price,
        smaDistPct: s200 > 0 ? ((price - s200) / s200) * 100 : 0,
        atrPct: price > 0 ? (a / price) * 100 : 0,
        change30dPct: pctChange(d.closes, 30),
        change90dPct: pctChange(d.closes, 90),
        btcChange30dPct: btcChange30,
        btcSmaDistPct,
        volumeTrend: pv > 0 ? rv / pv : 1,
        drawdownPct: high365 > 0 ? ((price - high365) / high365) * 100 : 0,
        fearGreed,
        degraded: d.degraded,
        historyDays: d.closes.length,
        fundamentals: fundamentals?.[token] ?? null,
        unrealizedPnlPct: pnl[token] ?? null,
        ...(token === 'BTC' ? { mvrvZ } : {}),
      };
      inputs[token] = input;
      verdicts[token] = computeHarvest(input);
    }

    const list = HARVEST_TOKENS.map(t => verdicts[t]);
    return {
      prices,
      fundamentals: fundamentals ?? null,
      verdicts,
      inputs,
      wbtcRisk: checkWbtcRisk({ wbtcPrice, btcPrice, btcAtrPct }),
      contrarian: contrarianCheck(list, inputs),
    };
  }, [query.data, fearGreed, holdings, livePrices, mvrvZ]);

  return { data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
}
