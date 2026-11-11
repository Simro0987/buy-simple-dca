/**
 * LIVE fundamental data layer — 100 % FREE data architecture.
 *
 * Hard rule: no paid subscription, no premium key, no user prompt for a key.
 * Sources (all public / free tier, no auth):
 *  · DefiLlama   — TVL, chain TVL history, fees, revenue, yields, stablecoin flows
 *  · CoinGecko   — market cap, FDV, circulating/total supply, 24h volume
 *  · Binance     — spot candles (200W SMA, volume), public futures funding & OI
 *  · Coinglass   — public endpoints when reachable (funding / OI / long-short)
 *
 * When a strictly paywalled metric (true on-chain MVRV, NUPL, Puell, ETF flows)
 * is unavailable, we silently substitute a local mathematical proxy derived
 * from free Binance data — never a mock number, never a key prompt.
 *
 * Everything is TTL-cached (see `freeCache.ts`) so free rate limits hold.
 */
import { cgFetch } from '@/lib/coingecko';
import { cached, safeJson, TTL } from '@/lib/freeCache';
import { EMPTY_METRICS, type FundamentalMetrics } from '@/lib/fundamentals';
import type { HarvestToken } from '@/lib/harvestEngine';

const LLAMA = 'https://api.llama.fi';
const LLAMA_STABLES = 'https://stablecoins.llama.fi';
const BINANCE = 'https://api.binance.com';
const BINANCE_FUT = 'https://fapi.binance.com';
const COINGLASS = 'https://open-api-v3.coinglass.com';

interface TokenSpec {
  cgId: string;
  pair: string;
  /** DefiLlama fees/revenue slug (chain or protocol). */
  feeSlug: string | null;
  /** DefiLlama chain name for TVL history (L1s only). */
  chain: string | null;
  /** DefiLlama protocol slug for current TVL (DeFi protocols only). */
  protocol: string | null;
}

const SPEC: Record<HarvestToken, TokenSpec> = {
  BTC: { cgId: 'bitcoin', pair: 'BTCUSDT', feeSlug: 'bitcoin', chain: 'Bitcoin', protocol: null },
  ETH: { cgId: 'ethereum', pair: 'ETHUSDT', feeSlug: 'ethereum', chain: 'Ethereum', protocol: null },
  SOL: { cgId: 'solana', pair: 'SOLUSDT', feeSlug: 'solana', chain: 'Solana', protocol: null },
  HYPE: { cgId: 'hyperliquid', pair: 'HYPEUSDT', feeSlug: 'hyperliquid', chain: 'Hyperliquid L1', protocol: null },
  AAVE: { cgId: 'aave', pair: 'AAVEUSDT', feeSlug: 'aave', chain: null, protocol: 'aave' },
  
  LINK: { cgId: 'chainlink', pair: 'LINKUSDT', feeSlug: 'chainlink', chain: null, protocol: null },
};

async function safeText(url: string, ms = 9000): Promise<number | null> {
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

/* ────────────────────────────── CoinGecko ────────────────────────────── */

interface CgMarket {
  id: string;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  total_volume: number | null;
}

async function loadCgMarkets(): Promise<Record<string, CgMarket>> {
  const rows = await cached<CgMarket[]>('cg:markets', TTL.coingecko, async () => {
    const ids = Object.values(SPEC).map((s) => s.cgId).join(',');
    const res = await cgFetch('/coins/markets', { vs_currency: 'usd', ids, per_page: 50, page: 1 });
    if (!res.ok) return null;
    const json = await res.json() as CgMarket[];
    return Array.isArray(json) && json.length ? json : null;
  });
  const out: Record<string, CgMarket> = {};
  for (const r of rows ?? []) out[r.id] = r;
  return out;
}

/* ────────────────────────────── DefiLlama ────────────────────────────── */

interface LlamaFees { total24h?: number; total7d?: number; total30d?: number; }

interface FeeBundle { fees24h: number | null; fees7d: number | null; fees30d: number | null; revenue30d: number | null }
const NO_FEES: FeeBundle = { fees24h: null, fees7d: null, fees30d: null, revenue30d: null };

async function loadFees(slug: string): Promise<FeeBundle> {
  const res = await cached<FeeBundle>(`llama:fees:${slug}`, TTL.llama, async () => {
    const [fees, rev] = await Promise.all([
      safeJson<LlamaFees>(`${LLAMA}/summary/fees/${slug}?dataType=dailyFees`),
      safeJson<LlamaFees>(`${LLAMA}/summary/fees/${slug}?dataType=dailyRevenue`),
    ]);
    if (!fees && !rev) return null;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    return {
      fees24h: n(fees?.total24h),
      fees7d: n(fees?.total7d),
      fees30d: n(fees?.total30d),
      revenue30d: n(rev?.total30d),
    };
  });
  return res ?? NO_FEES;
}

interface ChainTvl { tvlUsd: number | null; tvlChange30dPct: number | null }
const NO_TVL: ChainTvl = { tvlUsd: null, tvlChange30dPct: null };

async function loadChainTvl(chain: string): Promise<ChainTvl> {
  const res = await cached<ChainTvl>(`llama:chaintvl:${chain}`, TTL.llama, async () => {
    const rows = await safeJson<Array<{ date: number; tvl: number }>>(
      `${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(chain)}`, 12000,
    );
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const last = rows[rows.length - 1]?.tvl;
    const prev = rows[Math.max(0, rows.length - 31)]?.tvl;
    if (!Number.isFinite(last) || last <= 0) return null;
    return {
      tvlUsd: last,
      tvlChange30dPct: Number.isFinite(prev) && prev > 0 ? ((last - prev) / prev) * 100 : null,
    };
  });
  return res ?? NO_TVL;
}

async function loadProtocolTvl(slug: string): Promise<number | null> {
  return cached<number>(`llama:tvl:${slug}`, TTL.llama, () => safeText(`${LLAMA}/tvl/${slug}`));
}

/** Stablecoin supply trend = free macro liquidity gauge (DefiLlama, no key). */
async function loadStablecoinFlow(): Promise<number | null> {
  return cached<number>('llama:stables30d', TTL.llama, async () => {
    const rows = await safeJson<Array<{ totalCirculatingUSD?: Record<string, number> | number }>>(
      `${LLAMA_STABLES}/stablecoincharts/all`, 12000,
    );
    if (!Array.isArray(rows) || rows.length < 32) return null;
    const total = (r: { totalCirculatingUSD?: Record<string, number> | number } | undefined): number => {
      const v = r?.totalCirculatingUSD;
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object') return Object.values(v).reduce((a, b) => a + (Number(b) || 0), 0);
      return 0;
    };
    const last = total(rows[rows.length - 1]);
    const prev = total(rows[rows.length - 31]);
    if (last <= 0 || prev <= 0) return null;
    return ((last - prev) / prev) * 100;
  });
}

/** Free DefiLlama yields — best APY for a protocol (e.g. stETH). */
async function loadBestYield(project: string): Promise<number | null> {
  const pools = await cached<Array<{ project: string; apy: number | null; tvlUsd: number | null }>>(
    'llama:yields', TTL.llama, async () => {
      const json = await safeJson<{ data?: Array<{ project: string; apy: number | null; tvlUsd: number | null }> }>(
        'https://yields.llama.fi/pools', 15000,
      );
      const data = json?.data;
      if (!Array.isArray(data) || !data.length) return null;
      // Trim to keep localStorage small.
      return data
        .filter((p) => (p.tvlUsd ?? 0) > 1_000_000)
        .map((p) => ({ project: p.project, apy: p.apy, tvlUsd: p.tvlUsd }));
    },
  );
  if (!pools) return null;
  const apys = pools.filter((p) => p.project === project && Number.isFinite(p.apy) && (p.apy ?? 0) > 0)
    .map((p) => p.apy as number)
    .sort((a, b) => b - a);
  return apys.length ? apys[Math.floor(apys.length / 2)] : null;
}

/* ─────────────────── Binance free proxies (no paywall) ─────────────────── */

/** 200-week SMA from free weekly candles → MVRV / cycle-valuation proxy. */
async function loadPriceTo200wSma(pair: string, spot: number | null): Promise<number | null> {
  const sma = await cached<number>(`binance:200w:${pair}`, TTL.binanceCandles, async () => {
    const rows = await safeJson<Array<[number, string, string, string, string, ...unknown[]]>>(
      `${BINANCE}/api/v3/klines?symbol=${pair}&interval=1w&limit=210`, 12000,
    );
    if (!Array.isArray(rows) || rows.length < 26) return null;
    const closes = rows.map((r) => Number(r[4])).filter((n) => Number.isFinite(n) && n > 0);
    if (closes.length < 26) return null;
    const win = closes.slice(-200);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });
  const last = spot ?? null;
  if (!sma || sma <= 0 || !last || last <= 0) return null;
  return last / sma;
}

/** Abnormal-volume proxy: 24h quote volume vs the 30D average (ETF/inflow proxy). */
async function loadVolumeSpike(pair: string): Promise<number | null> {
  return cached<number>(`binance:volspike:${pair}`, TTL.binanceCandles, async () => {
    const rows = await safeJson<Array<[number, string, string, string, string, string, ...unknown[]]>>(
      `${BINANCE}/api/v3/klines?symbol=${pair}&interval=1d&limit=31`, 12000,
    );
    if (!Array.isArray(rows) || rows.length < 15) return null;
    const vols = rows.map((r) => Number(r[5])).filter((n) => Number.isFinite(n) && n >= 0);
    if (vols.length < 15) return null;
    const last = vols[vols.length - 1];
    const base = vols.slice(0, -1);
    const avg = base.reduce((a, b) => a + b, 0) / base.length;
    return avg > 0 ? last / avg : null;
  });
}

/** Public Binance futures funding rate (%/8h). Free, no key. */
async function loadFunding(pair: string): Promise<number | null> {
  return cached<number>(`binance:funding:${pair}`, TTL.binanceDerivs, async () => {
    const j = await safeJson<{ lastFundingRate?: string }>(`${BINANCE_FUT}/fapi/v1/premiumIndex?symbol=${pair}`);
    const v = Number(j?.lastFundingRate);
    return Number.isFinite(v) ? v * 100 : null;
  });
}

/** Public Binance futures open-interest change over 7 days, %. */
async function loadOiChange7d(pair: string): Promise<number | null> {
  return cached<number>(`binance:oi7d:${pair}`, TTL.binanceDerivs, async () => {
    const rows = await safeJson<Array<{ sumOpenInterestValue?: string }>>(
      `${BINANCE_FUT}/futures/data/openInterestHist?symbol=${pair}&period=1d&limit=8`,
    );
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const first = Number(rows[0]?.sumOpenInterestValue);
    const last = Number(rows[rows.length - 1]?.sumOpenInterestValue);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return null;
    return ((last - first) / first) * 100;
  });
}

/**
 * Coinglass public endpoint attempt (BTC funding/OI aggregate). Requires no key
 * on the open routes; if it 401s or is rate-limited we simply return null and
 * the Binance proxies above carry the leg.
 */
async function loadCoinglassBtc(): Promise<{ fundingPct: number | null } | null> {
  return cached<{ fundingPct: number | null }>('coinglass:btc', TTL.onchain, async () => {
    const j = await safeJson<{ code?: string; data?: Array<{ uMarginList?: Array<{ rate?: number }> }> }>(
      `${COINGLASS}/api/futures/fundingRate/exchange-list?symbol=BTC`, 8000,
    );
    const rate = j?.data?.[0]?.uMarginList?.find((r) => Number.isFinite(r?.rate))?.rate;
    return Number.isFinite(rate) ? { fundingPct: rate as number } : null;
  });
}

export type FundamentalMetricsMap = Record<HarvestToken, FundamentalMetrics>;

/**
 * Fetches every fundamental from free sources in parallel.
 * `priceToYearAvg` and `spot` come from live Binance candles supplied by the
 * caller; both feed the paywall-free MVRV proxy.
 */
export async function fetchFundamentals(
  priceToYearAvg: Partial<Record<HarvestToken, number>> = {},
  spot: Partial<Record<HarvestToken, number>> = {},
): Promise<FundamentalMetricsMap> {
  const tokens = Object.keys(SPEC) as HarvestToken[];

  const [markets, stableFlow, coinglass, perToken] = await Promise.all([
    loadCgMarkets(),
    loadStablecoinFlow(),
    loadCoinglassBtc(),
    Promise.all(tokens.map(async (token) => {
      const spec = SPEC[token];
      const [fees, chainTvl, protoTvl, sma200w, volSpike, funding, oi7d, yieldApy] = await Promise.all([
        spec.feeSlug ? loadFees(spec.feeSlug) : Promise.resolve(NO_FEES),
        spec.chain ? loadChainTvl(spec.chain) : Promise.resolve(NO_TVL),
        spec.protocol ? loadProtocolTvl(spec.protocol) : Promise.resolve(null),
        loadPriceTo200wSma(spec.pair, spot[token] ?? null),
        loadVolumeSpike(spec.pair),
        loadFunding(spec.pair),
        loadOiChange7d(spec.pair),
        spec.protocol ? loadBestYield(spec.protocol) : Promise.resolve(null),
      ]);
      return { token, fees, chainTvl, protoTvl, sma200w, volSpike, funding, oi7d, yieldApy };
    })),
  ]);

  const out = {} as FundamentalMetricsMap;

  for (const { token, fees, chainTvl, protoTvl, sma200w, volSpike, funding, oi7d, yieldApy } of perToken) {
    const spec = SPEC[token];
    const cg = markets[spec.cgId];
    const sources: string[] = [];
    if (fees.fees30d != null || chainTvl.tvlUsd != null || protoTvl != null || yieldApy != null || stableFlow != null) sources.push('DefiLlama');
    if (cg) sources.push('CoinGecko');
    if (sma200w != null || volSpike != null || funding != null || oi7d != null) sources.push('Binance');
    if (token === 'BTC' && coinglass?.fundingPct != null) sources.push('Coinglass');

    // MVRV proxy: spot / 200W SMA — the free stand-in for on-chain MVRV.
    const mvrvProxy = sma200w;
    const fundingPct = token === 'BTC' ? (coinglass?.fundingPct ?? funding) : funding;

    out[token] = {
      ...EMPTY_METRICS,
      marketCap: cg?.market_cap ?? null,
      fdv: cg?.fully_diluted_valuation ?? null,
      circulatingSupply: cg?.circulating_supply ?? null,
      totalSupply: cg?.total_supply ?? null,
      volume24h: cg?.total_volume ?? null,
      tvlUsd: chainTvl.tvlUsd ?? protoTvl ?? null,
      tvlChange30dPct: chainTvl.tvlChange30dPct,
      fees24h: fees.fees24h,
      fees7d: fees.fees7d,
      fees30d: fees.fees30d,
      revenue30d: fees.revenue30d,
      mvrv: mvrvProxy,
      mvrvSource: mvrvProxy != null ? 'proxy' : null,
      priceToYearAvg: priceToYearAvg[token] ?? null,
      fundingRatePct: fundingPct,
      oiChange7dPct: oi7d,
      volumeSpikeRatio: volSpike,
      stablecoinFlow30dPct: stableFlow,
      yieldApyPct: yieldApy,
      sources,
    };
  }

  return out;
}
