/**
 * Backend mirror of `src/lib/harvestEngine.ts` (Deno).
 * Same 10-layer scoring, same continuous TP interpolation, same routing —
 * so the Telegram report and the Portfolio UI never disagree.
 */

import { computeFundamentals, EMPTY_METRICS, type FundamentalMetrics } from './fundamentals.ts';
import { loadDailyCandles } from './candles.ts';


export const HARVEST_TOKENS = ['BTC', 'ETH', 'SOL', 'HYPE', 'AAVE', 'LINK'] as const;
export type HarvestToken = typeof HARVEST_TOKENS[number];

const PAIR: Record<HarvestToken, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', HYPE: 'HYPEUSDT',
  AAVE: 'AAVEUSDT', LINK: 'LINKUSDT',
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const mapRange = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  x1 === x0 ? y0 : lerp(y0, y1, (x - x0) / (x1 - x0));

interface FundamentalSpec { metrics: string[]; thesis: number }

/** `thesis` is the user's strategy conviction; every other layer is live API data. */
export const FUNDAMENTALS: Record<HarvestToken, FundamentalSpec> = {
  BTC: { metrics: ['MVRV / cena vs 365D', 'Fees', 'Chain TVL'], thesis: 9.6 },
  ETH: { metrics: ['Fees & burn', 'Chain TVL 30D', 'MCap/TVL'], thesis: 9.0 },
  SOL: { metrics: ['Fees', 'Chain TVL 30D', 'MCap/TVL'], thesis: 8.4 },
  HYPE: { metrics: ['Perp fees', 'HyperEVM TVL', 'MCap/FDV'], thesis: 7.2 },
  AAVE: { metrics: ['Fees & revenue', 'Protocol TVL', 'Float'], thesis: 7.8 },
  
  LINK: { metrics: ['Oracle/CCIP fees', 'Revenue share', 'Float'], thesis: 8.0 },
};

export interface HarvestInput {
  token: HarvestToken;
  price: number;
  rsi14: number;
  ema50: number;
  smaDistPct: number;
  atrPct: number;
  change30dPct: number;
  change90dPct: number;
  btcChange30dPct: number;
  btcSmaDistPct: number;
  volumeTrend: number;
  fearGreed: number;
  degraded: boolean;
  fundamentals: FundamentalMetrics | null;
  unrealizedPnlPct: number | null;
}

export type HarvestCategory = 'A' | 'WATCH' | 'B' | 'C' | 'D';

export interface HarvestVerdict {
  token: HarvestToken;
  score: number;
  category: HarvestCategory;
  categoryLabel: string;
  tpPct: number;
  overheat: number;
  whenText: string;
  destination: string;
  degraded: boolean;
  unrealizedPnlPct: number | null;
  pnlGated: boolean;
  fundamentalNote: string;
}

const WEIGHTS = {
  thesis: 1.4, fundamentals: 1.4, valuation: 1.3, regime: 1.1, relStrength: 1.0,
  momentum: 1.0, tokenomics: 0.8, onchain: 0.8, sentiment: 0.6, technical: 1.6,
};

export function destinationFor(token: HarvestToken): string {
  return token === 'BTC' ? 'USDC / USDT (stablecoin)' : 'wBTC (ARB)';
}

function scoreOf(i: HarvestInput): { score: number; note: string } {
  const spec = FUNDAMENTALS[i.token];
  const thesisPenalty = i.smaDistPct < -35 ? mapRange(i.smaDistPct, -35, -70, 0, 3) : 0;
  const thesis = clamp(spec.thesis - thesisPenalty, 0, 10);
  const fund = i.fundamentals ? computeFundamentals(i.fundamentals) : null;
  const fundamentals = fund?.score ?? 0;
  const fundamentalsWeight = fund?.score != null ? WEIGHTS.fundamentals : 0;
  const valuation = clamp(mapRange(i.smaDistPct, -40, 90, 10, 0.5) - mapRange(i.change90dPct, 40, 200, 0, 2), 0, 10);
  const regime = clamp(mapRange(i.btcSmaDistPct, -25, 60, 2, 9.5), 0, 10);
  const rs = i.change30dPct - i.btcChange30dPct;
  const relStrength = i.token === 'BTC' ? 6.5 : clamp(mapRange(rs, -25, 25, 2, 9), 0, 10);
  const emaDist = i.ema50 > 0 ? ((i.price - i.ema50) / i.ema50) * 100 : 0;
  const momentum = clamp(mapRange(emaDist, -18, 18, 2.5, 8.5) * 0.6 + mapRange(i.change30dPct, -30, 45, 2, 9) * 0.4, 0, 10);
  const tokLegs = (fund?.legs ?? []).filter((l) => l.key === 'float' || l.key === 'revenueQuality');
  const tokenomics = tokLegs.length ? tokLegs.reduce((a, l) => a + l.score, 0) / tokLegs.length : 0;
  const tokenomicsWeight = tokLegs.length ? WEIGHTS.tokenomics : 0;
  const onchain = clamp(mapRange(i.volumeTrend, 0.5, 1.8, 3, 9) * 0.7 + mapRange(i.smaDistPct, -30, 30, 3, 8) * 0.3, 0, 10);
  const sentiment = clamp(mapRange(i.fearGreed, 10, 90, 9, 1.5), 0, 10);
  const technical = clamp(
    mapRange(i.rsi14, 78, 38, 1, 9) * 0.6
    + mapRange(i.smaDistPct, 100, -20, 1, 8.5) * 0.3
    + mapRange(i.atrPct, 12, 2, 3, 8) * 0.1,
    0, 10,
  );

  const parts: Array<[number, number]> = [
    [thesis, WEIGHTS.thesis], [fundamentals, fundamentalsWeight], [valuation, WEIGHTS.valuation],
    [regime, WEIGHTS.regime], [relStrength, WEIGHTS.relStrength], [momentum, WEIGHTS.momentum],
    [tokenomics, tokenomicsWeight], [onchain, WEIGHTS.onchain], [sentiment, WEIGHTS.sentiment],
    [technical, WEIGHTS.technical],
  ];
  const tw = parts.reduce((a, p) => a + p[1], 0);
  return {
    score: tw > 0 ? clamp(parts.reduce((a, p) => a + p[0] * p[1], 0) / tw, 0, 10) : 0,
    note: fund
      ? `${fund.note}${fund.sources.length ? ` · ${fund.sources.join(' + ')}` : ''}`
      : 'live fundamenty nedostupné',
  };
}

export function categorize(score: number): { category: HarvestCategory; label: string } {
  if (score >= 8) return { category: 'A', label: 'A — HOLD / AKUMULOVAŤ' };
  if (score >= 6) return { category: 'WATCH', label: 'WATCH / AKUMULOVAŤ' };
  if (score >= 4) return { category: 'B', label: 'B — ČIASTOČNÝ TP' };
  if (score >= 2) return { category: 'C', label: 'C — AGRESÍVNY TP' };
  return { category: 'D', label: 'D — EXIT / TÉZA ZLOMENÁ' };
}

export const MIN_PROFIT_GATE_PCT = 15;

/** Smooth exponential score → base TP % (no brackets, no steps). */
export function tpPctFromScore(score: number): number {
  const s = clamp(score, 0, 10);
  return clamp(45 * Math.exp(-0.62 * s) * clamp((9 - s) / 1.5, 0, 1), 0, 60);
}

/** Continuous PnL aggression: 0 at the +15 % gate, saturating at 1,6×. */
export function pnlAggression(pnlPct: number | null | undefined): number {
  if (pnlPct == null) return 0;
  const excess = pnlPct - MIN_PROFIT_GATE_PCT;
  return excess <= 0 ? 0 : 1.6 * (1 - Math.exp(-excess / 25));
}


function overheatOf(i: HarvestInput): number {
  return clamp(
    mapRange(i.rsi14, 35, 85, 5, 95) * 0.45
    + mapRange(i.smaDistPct, -10, 90, 5, 95) * 0.3
    + mapRange(i.fearGreed, 20, 90, 10, 90) * 0.15
    + mapRange(i.atrPct, 2, 12, 10, 80) * 0.10,
    0, 100,
  );
}

function whenText(overheat: number, category: HarvestCategory): string {
  if (category === 'D') return '🚨 Téza zlomená — výber bez ohľadu na teplotu';
  if (overheat >= 85) return '🚨 Extrémna zóna';
  if (overheat >= 70) return '🔥 Silné prehriatie';
  if (overheat >= 55) return '🔥 Mierne prehriatie';
  if (overheat >= 35) return 'Trh je stabilný';
  return '🧊 Chladná zóna';
}

export function computeHarvest(i: HarvestInput): HarvestVerdict {
  const { score, note } = scoreOf(i);
  const { category, label } = categorize(score);
  const overheat = overheatOf(i);
  let tpPct = clamp(tpPctFromScore(score) * (1 + mapRange(overheat, 30, 95, -0.25, 0.35)), 0, 60);

  // STRICT RULE: TP stays locked until the real unrealized PnL crosses +15 %.
  // Above the gate it scales continuously with PnL. Zone D exits regardless.
  const pnlPct = i.unrealizedPnlPct;
  const pnlGated = category !== 'D' && (pnlPct == null || pnlPct < MIN_PROFIT_GATE_PCT) && tpPct > 0;
  if (category !== 'D') {
    tpPct = pnlGated ? 0 : clamp(tpPct * pnlAggression(pnlPct), 0, 60);
  }

  return {
    token: i.token,
    score,
    category,
    categoryLabel: label,
    tpPct,
    overheat,
    whenText: pnlGated
      ? `🔒 TP zablokované: Zisk pod limitom (+15 %)${pnlPct != null ? ` — teraz ${pnlPct.toFixed(2).replace('.', ',')} %` : ''}`
      : whenText(overheat, category),

    destination: destinationFor(i.token),
    degraded: i.degraded,
    unrealizedPnlPct: pnlPct,
    pnlGated,
    fundamentalNote: note,
  };
}

// ── Live input loading (daily candles, Binance → CoinGecko cascade) ──────────

interface Daily { closes: number[]; highs: number[]; lows: number[]; volumes: number[]; degraded: boolean; }

const CG_ID: Record<HarvestToken, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', HYPE: 'hyperliquid',
  AAVE: 'aave', LINK: 'chainlink',
};

/** Fully awaited candle load; only flags `degraded` when every source failed. */
async function loadDaily(token: HarvestToken): Promise<Daily> {
  const c = await loadDailyCandles(PAIR[token], CG_ID[token], 365);
  const valid = c.closes.filter((x) => Number.isFinite(x) && x > 0).length;
  if (c.source === 'unavailable' || valid < 30) {
    return { closes: [], highs: [], lows: [], volumes: [], degraded: true };
  }
  return { closes: c.closes, highs: c.highs, lows: c.lows, volumes: c.volumes, degraded: false };
}


const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

function ema(v: number[], p: number): number {
  const s = v.slice(-(p * 3));
  if (!s.length) return 0;
  const k = 2 / (p + 1);
  let e = s[0];
  for (let i = 1; i < s.length; i++) e = s[i] * k + e * (1 - k);
  return e;
}

function rsiWilder(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / period, al = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(0, d)) / period;
    al = (al * (period - 1) + Math.max(0, -d)) / period;
  }
  if (al === 0) return ag === 0 ? 50 : 99;
  return clamp(100 - 100 / (1 + ag / al), 0, 100);
}

function atr14(h: number[], l: number[], c: number[]): number {
  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  return avg(trs.slice(-14));
}

function pctChange(c: number[], back: number): number {
  if (c.length < 2) return 0;
  const past = c[Math.max(0, c.length - 1 - back)];
  const last = c[c.length - 1];
  return past > 0 ? ((last - past) / past) * 100 : 0;
}


// ── Live fundamentals (DefiLlama + CoinGecko), failure-isolated ──────────────

const LLAMA = 'https://api.llama.fi';

interface LlamaSpec { cgId: string; feeSlug: string; chain: string | null; protocol: string | null }

const FUND_SPEC: Record<HarvestToken, LlamaSpec> = {
  BTC: { cgId: 'bitcoin', feeSlug: 'bitcoin', chain: 'Bitcoin', protocol: null },
  ETH: { cgId: 'ethereum', feeSlug: 'ethereum', chain: 'Ethereum', protocol: null },
  SOL: { cgId: 'solana', feeSlug: 'solana', chain: 'Solana', protocol: null },
  HYPE: { cgId: 'hyperliquid', feeSlug: 'hyperliquid', chain: 'Hyperliquid L1', protocol: null },
  AAVE: { cgId: 'aave', feeSlug: 'aave', chain: null, protocol: 'aave' },
  
  LINK: { cgId: 'chainlink', feeSlug: 'chainlink', chain: null, protocol: null },
};

async function safeJson<T>(url: string, ms = 9000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

async function safeNumber(url: string, ms = 9000): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const n = Number(await res.text());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

const posNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

interface CgMarket {
  id: string;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  total_volume: number | null;
}

async function loadFundamentals(
  priceToYearAvg: Partial<Record<HarvestToken, number>>,
): Promise<Record<HarvestToken, FundamentalMetrics | null>> {
  const ids = HARVEST_TOKENS.map((t) => FUND_SPEC[t].cgId).join(',');
  const [markets, perToken] = await Promise.all([
    safeJson<CgMarket[]>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&per_page=50&page=1`,
      10000,
    ),
    Promise.all(HARVEST_TOKENS.map(async (token) => {
      const spec = FUND_SPEC[token];
      const [fees, revenue, chainTvl, protoTvl] = await Promise.all([
        safeJson<{ total24h?: number; total7d?: number; total30d?: number }>(`${LLAMA}/summary/fees/${spec.feeSlug}?dataType=dailyFees`),
        safeJson<{ total30d?: number }>(`${LLAMA}/summary/fees/${spec.feeSlug}?dataType=dailyRevenue`),
        spec.chain
          ? safeJson<Array<{ date: number; tvl: number }>>(`${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(spec.chain)}`, 12000)
          : Promise.resolve(null),
        spec.protocol ? safeNumber(`${LLAMA}/tvl/${spec.protocol}`) : Promise.resolve(null),
      ]);
      return { token, fees, revenue, chainTvl, protoTvl };
    })),
  ]);

  const byId = new Map<string, CgMarket>();
  for (const m of markets ?? []) byId.set(m.id, m);

  const out = {} as Record<HarvestToken, FundamentalMetrics | null>;
  for (const { token, fees, revenue, chainTvl, protoTvl } of perToken) {
    const cg = byId.get(FUND_SPEC[token].cgId);
    let tvlUsd: number | null = protoTvl;
    let tvlChange30dPct: number | null = null;
    if (Array.isArray(chainTvl) && chainTvl.length > 1) {
      const last = chainTvl[chainTvl.length - 1]?.tvl;
      const prev = chainTvl[Math.max(0, chainTvl.length - 31)]?.tvl;
      if (Number.isFinite(last) && last > 0) {
        tvlUsd = last;
        if (Number.isFinite(prev) && prev > 0) tvlChange30dPct = ((last - prev) / prev) * 100;
      }
    }

    const sources: string[] = [];
    if (fees?.total30d != null || tvlUsd != null) sources.push('DefiLlama');
    if (cg) sources.push('CoinGecko');

    const metrics: FundamentalMetrics = {
      ...EMPTY_METRICS,
      marketCap: cg?.market_cap ?? null,
      fdv: cg?.fully_diluted_valuation ?? null,
      circulatingSupply: cg?.circulating_supply ?? null,
      totalSupply: cg?.total_supply ?? null,
      volume24h: cg?.total_volume ?? null,
      tvlUsd,
      tvlChange30dPct,
      fees24h: posNum(fees?.total24h),
      fees7d: posNum(fees?.total7d),
      fees30d: posNum(fees?.total30d),
      revenue30d: posNum(revenue?.total30d),
      mvrv: null,
      priceToYearAvg: priceToYearAvg[token] ?? null,
      sources,
    };
    out[token] = sources.length ? metrics : null;
  }
  return out;
}

export interface HarvestReportData {
  verdicts: HarvestVerdict[];
  contrarian: string;
}

/**
 * Loads live candles + live fundamentals and returns verdicts for all harvest
 * tokens. Every fetch is awaited (in small batches, to respect the CoinGecko
 * free-tier limit) before any verdict is computed. Never throws.
 */
export async function loadHarvestVerdicts(
  fearGreed: number,
  unrealizedPnlPct: Partial<Record<string, number | null>> = {},
): Promise<HarvestReportData> {
  const daily = {} as Record<HarvestToken, Daily>;
  const BATCH = 3;
  for (let i = 0; i < HARVEST_TOKENS.length; i += BATCH) {
    const batch = HARVEST_TOKENS.slice(i, i + BATCH);
    const entries = await Promise.all(
      batch.map(async (t) => {
        try {
          return [t, await loadDaily(t)] as const;
        } catch {
          return [t, { closes: [], highs: [], lows: [], volumes: [], degraded: true }] as const;
        }
      }),
    );
    for (const [t, d] of entries) daily[t] = d;
  }


  const btc = daily.BTC;
  const btcPrice = btc.closes[btc.closes.length - 1] ?? 0;
  const btcSma = btc.closes.length >= 200 ? avg(btc.closes.slice(-200)) : 0;
  const btcSmaDistPct = btcSma > 0 ? ((btcPrice - btcSma) / btcSma) * 100 : 0;
  const btcChange30dPct = pctChange(btc.closes, 30);

  // MVRV proxy from live candles + live fundamentals (never mocked).
  const priceToYearAvg: Partial<Record<HarvestToken, number>> = {};
  for (const t of HARVEST_TOKENS) {
    const c = daily[t].closes;
    if (c.length >= 60) {
      const yearAvg = avg(c.slice(-365));
      const last = c[c.length - 1];
      if (yearAvg > 0 && last > 0) priceToYearAvg[t] = last / yearAvg;
    }
  }
  const fundamentals = await loadFundamentals(priceToYearAvg).catch(() => null);

  const inputs: HarvestInput[] = HARVEST_TOKENS.map((token) => {
    const d = daily[token];
    const price = d.closes[d.closes.length - 1] ?? 0;
    const sma = d.closes.length >= 200
      ? avg(d.closes.slice(-200))
      : d.closes.length > 20 ? avg(d.closes) : 0;
    const a = atr14(d.highs, d.lows, d.closes);
    const rv = avg(d.volumes.slice(-7));
    const pv = avg(d.volumes.slice(-37, -7));
    return {
      token,
      price,
      rsi14: rsiWilder(d.closes),
      ema50: d.closes.length >= 50 ? ema(d.closes, 50) : price,
      smaDistPct: sma > 0 ? ((price - sma) / sma) * 100 : 0,
      atrPct: price > 0 ? (a / price) * 100 : 0,
      change30dPct: pctChange(d.closes, 30),
      change90dPct: pctChange(d.closes, 90),
      btcChange30dPct,
      btcSmaDistPct,
      volumeTrend: pv > 0 ? rv / pv : 1,
      fearGreed,
      degraded: d.degraded,
      fundamentals: fundamentals?.[token] ?? null,
      unrealizedPnlPct: unrealizedPnlPct[token] ?? null,
    };
  });

  const verdicts = inputs.map(computeHarvest);
  return { verdicts, contrarian: contrarianCheck(verdicts, inputs) };
}

/** "Kde je najväčšie riziko, že sa mýlime?" — anti confirmation-bias line. */
export function contrarianCheck(verdicts: HarvestVerdict[], inputs: HarvestInput[]): string {
  const selling = verdicts.filter((v) => v.tpPct > 0.5).sort((a, b) => b.tpPct - a.tpPct);
  if (!selling.length) {
    return 'Držíme všetko — najväčšie riziko je, že cyklus vrcholí a nevyberieme nič. '
      + 'Sleduj, či RSI a odchýlka od 200D SMA nerastú rýchlejšie než klesá skóre.';
  }
  const top = selling[0];
  const ind = inputs.find((i) => i.token === top.token);
  const strongTrend = !!ind && ind.smaDistPct > 15 && ind.change30dPct > 10;
  const parts = [`Najviac predávame ${top.token} (${top.tpPct.toFixed(2).replace('.', ',')} %).`];
  parts.push(strongTrend
    ? 'Riziko: token je v silnom trende nad 200D SMA — predaj do sily môže ukrojiť z víťaza a pripraviť nás o zvyšok impulzu.'
    : 'Riziko: skóre padá kvôli technike, nie fundamentom — môže ísť len o korekciu a predávame do slabosti.');
  parts.push(top.destination.startsWith('wBTC')
    ? 'Druhé riziko: rotácia do wBTC predpokladá, že BTC outperformuje — ak alt-season pokračuje, stojí to výkonnosť.'
    : 'Druhé riziko: stablecoin pri pokračujúcom bull trende znamená reálnu stratu kúpnej sily.');
  return parts.join(' ');
}
