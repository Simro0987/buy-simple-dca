import { wilderRsi } from '@/lib/rsi';
import { useQuery } from '@tanstack/react-query';
import { fetchTokenPrice, COINGECKO_ID } from '@/lib/apiManager';
import { useTokenRemoved } from '@/lib/dcaTokenVisibility';
import { basketAsset } from '@/lib/assetBaskets';

export interface TokenDailyIndicators {
  price: number;
  sma200: number;
  ema50: number;
  rsi14: number;
  atr14: number;
  smaDistPct: number;
  swingHigh: number;
  /** 30D swing low — základ pre S1 pivot. */
  swingLow: number;
  /**
   * 'binance'   = reálne denné sviečky z Binance
   * 'coingecko' = reálne denné ceny z CoinGecko (cez backend proxy)
   * 'fallback'  = live cena + syntetické indikátory (posledná možnosť)
   */
  source: 'binance' | 'coingecko' | 'yahoo' | 'fallback';
  /** Živá cena prepísaná z DexScreener (low-cap / DEX tokeny). */
  livePriceSource?: 'dexscreener';
  /** Likvidita najväčšieho DEX páru v USD. */
  dexLiquidityUsd?: number;
  candleCount: number;
  /** Zmena poslednej dennej zatváracej ceny oproti predchádzajúcej, v %. */
  change24hPct: number;
  /** Rast za posledných 30 denných sviečok, v % (Euphoria Brake — KROK 1). */
  change30dPct: number;
  /** Objem poslednej dennej sviečky (USD) a priemer 20D — 0 ak nedostupné. */
  volume24h: number;
  volumeAvg20: number;
  /** RSI(14) z týždenných zatvorení (resample denných sviečok). */
  rsiWeekly: number | null;
  /** Zmena za 7 denných sviečok v %. */
  change7dPct?: number;
  /** Dolné Bollingerovo pásmo (20, 2σ). */
  bbLower?: number;
  /** Minimum za posledných 7 dní (detekcia odrazu). */
  low7d?: number;
}

function extraStats(closes: number[], lows: number[], price: number) {
  const c = closes.filter((n) => Number.isFinite(n) && n > 0);
  const base7 = c[Math.max(0, c.length - 8)];
  const last20 = c.slice(-20);
  const mean = last20.reduce((a, b) => a + b, 0) / (last20.length || 1);
  const sd = Math.sqrt(last20.reduce((a, b) => a + (b - mean) ** 2, 0) / (last20.length || 1));
  const l7 = lows.slice(-7).filter((n) => Number.isFinite(n) && n > 0);
  return {
    change7dPct: base7 > 0 && price > 0 ? ((price - base7) / base7) * 100 : 0,
    bbLower: last20.length >= 20 ? mean - 2 * sd : 0,
    low7d: l7.length ? Math.min(...l7) : 0,
  };
}

function volStats(vols: number[]): { volume24h: number; volumeAvg20: number } {
  const v = vols.filter((n) => Number.isFinite(n) && n > 0);
  if (v.length < 21) return { volume24h: 0, volumeAvg20: 0 };
  const prev = v.slice(-21, -1);
  return { volume24h: v[v.length - 1], volumeAvg20: prev.reduce((a, b) => a + b, 0) / prev.length };
}
function weeklyRsi(closes: number[]): number | null {
  const w: number[] = [];
  for (let i = closes.length - 1; i >= 0; i -= 7) w.unshift(closes[i]);
  return w.length >= 15 ? rsi(w, 14) : null;
}

function growth30(closes: number[], price: number): number {
  if (closes.length < 2 || !(price > 0)) return 0;
  const base = closes[Math.max(0, closes.length - 31)];
  return base > 0 ? ((price - base) / base) * 100 : 0;
}


function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function ema(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = slice[0];
  for (let i = 1; i < slice.length; i++) e = slice[i] * k + e * (1 - k);
  return e;
}

const rsi = wilderRsi;

/** Explicitný symbol → Binance spot pár (žiadne hádanie `${SYM}USDT`). */
const BINANCE_PAIRS: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', LINK: 'LINKUSDT', AAVE: 'AAVEUSDT',
  UNI: 'UNIUSDT', NEAR: 'NEARUSDT', PENDLE: 'PENDLEUSDT', TAO: 'TAOUSDT',
  INJ: 'INJUSDT', ENA: 'ENAUSDT', PUMP: 'PUMPUSDT', HYPE: 'HYPEUSDT',
};

/** ATR(14) — mean True Range over the last `period` candles. */
function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

/**
 * Reálne denné zatváracie ceny z CoinGecko (cez `coingecko-proxy` edge funkciu —
 * obchádza CORS aj rate-limit). 365 denných bodov → skutočná 200D MA, RSI(14),
 * 50D EMA. ATR sa počíta z close-to-close true range. Null keď dáta nie sú.
 */
async function fetchFromCoinGecko(symbol: string, cgId?: string | null): Promise<TokenDailyIndicators | null> {
  const id = cgId || COINGECKO_ID[symbol.toUpperCase()];
  if (!id) return null;
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coingecko-proxy`
      + `?path=${encodeURIComponent(`/coins/${id}/market_chart`)}&vs_currency=usd&days=365`;
    const res = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '' },
    });
    if (!res.ok) return null;
    const j = await res.json() as { prices?: Array<[number, number]>; total_volumes?: Array<[number, number]> };
    const closes = (j.prices ?? [])
      .map(r => Number(r[1]))
      .filter(n => Number.isFinite(n) && n > 0);
    if (closes.length < 40) return null;

    const price = closes[closes.length - 1];
    const e50 = ema(closes, 50);
    const s200raw = closes.length >= 200 ? sma(closes, 200) : NaN;
    const s200 = Number.isFinite(s200raw) && s200raw > 0 ? s200raw : e50;
    return {
      price,
      sma200: s200,
      ema50: e50,
      rsi14: rsi(closes, 14),
      atr14: atr(closes, closes, closes, 14),
      smaDistPct: s200 > 0 ? ((price - s200) / s200) * 100 : 0,
      swingHigh: Math.max(...closes.slice(-30)),
      swingLow: Math.min(...closes.slice(-30)),
      source: 'coingecko',
      candleCount: closes.length,
      change24hPct: closes.length > 1 ? ((price - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0,
      change30dPct: growth30(closes, price),
      ...volStats((j.total_volumes ?? []).map(r => Number(r[1]))),
      rsiWeekly: weeklyRsi(closes),
      ...extraStats(closes, closes, price),
    };
  } catch {
    return null;
  }
}

async function fetchDailyCrypto(symbol: string, cgId?: string | null): Promise<TokenDailyIndicators> {
  const sym = symbol.toUpperCase();
  const pair = BINANCE_PAIRS[sym];
  try {
    // Len overené Binance páry — tokeny bez spotového páru (XMR, HNT delistované)
    // idú priamo na CoinGecko podľa presného cgId, aby nevznikla zámena tickerov.
    if (!pair) throw new Error('no verified binance pair');
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=200`);
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const raw = await res.json() as Array<[number, string, string, string, string, ...unknown[]]>;
    const highs = raw.map(k => Number(k[2]));
    const lows = raw.map(k => Number(k[3]));
    const closes = raw.map(k => Number(k[4]));
    if (closes.filter(n => Number.isFinite(n) && n > 0).length < 40) throw new Error('insufficient candles');

    const price = closes[closes.length - 1];
    const e50 = ema(closes, 50);
    // CRITICAL FALLBACK: keď 200D MA nie je dostupná (málo sviečok / null),
    // použije sa 50D EMA, aby výpočty nikdy nespadli na undefined.
    const s200raw = sma(closes, 200);
    const s200 = Number.isFinite(s200raw) && s200raw > 0 ? s200raw : e50;
    return {
      price,
      sma200: s200,
      ema50: e50,
      rsi14: rsi(closes, 14),
      atr14: atr(highs, lows, closes, 14),
      smaDistPct: s200 > 0 ? ((price - s200) / s200) * 100 : 0,
      swingHigh: Math.max(...highs.slice(-30)),
      swingLow: Math.min(...lows.slice(-30)),
      source: 'binance',
      candleCount: closes.length,
      change24hPct: closes.length > 1 ? ((price - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0,
      change30dPct: growth30(closes, price),
      ...volStats(raw.map(k => Number(k[5]) * Number(k[4]))),
      rsiWeekly: weeklyRsi(closes),
      ...extraStats(closes, lows, price),
    };
  } catch {
    // SECOND SOURCE: reálne denné OHLC z CoinGecko cez backend proxy
    // (Binance je v niektorých regiónoch blokovaný — 451/CORS).
    const cg = await fetchFromCoinGecko(symbol, cgId);
    if (cg) return cg;

    const price = await fetchTokenPrice(symbol.toUpperCase());
    if (!Number.isFinite(price) || price <= 0) throw new Error(`${symbol} price unavailable`);
    const s200 = price * 0.94;
    return {
      price,
      sma200: s200,
      ema50: price * 1.02,
      rsi14: 50,
      atr14: price * 0.05,
      smaDistPct: ((price - s200) / s200) * 100,
      swingHigh: price * 1.15,
      swingLow: price * 0.85,
      source: 'fallback',
      candleCount: 0,
      change24hPct: 0,
      change30dPct: 0,
      volume24h: 0,
      volumeAvg20: 0,
      rsiWeekly: null,
    };
  }
}

function fromOhlc(highs: number[], lows: number[], closes: number[], livePrice: number, source: TokenDailyIndicators['source']): TokenDailyIndicators {
  const price = livePrice > 0 ? livePrice : closes[closes.length - 1];
  const e50 = ema(closes, 50);
  const s200raw = closes.length >= 200 ? sma(closes, 200) : NaN;
  const s200 = Number.isFinite(s200raw) && s200raw > 0 ? s200raw : e50;
  return {
    price,
    sma200: s200,
    ema50: e50,
    rsi14: rsi(closes, 14),
    atr14: atr(highs, lows, closes, 14),
    smaDistPct: s200 > 0 ? ((price - s200) / s200) * 100 : 0,
    swingHigh: Math.max(...highs.slice(-30)),
    swingLow: Math.min(...lows.slice(-30)),
    source,
    candleCount: closes.length,
    change24hPct: closes.length > 1 ? ((price - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0,
    change30dPct: growth30(closes, price),
    volume24h: 0,
    volumeAvg20: 0,
    rsiWeekly: weeklyRsi(closes),
    ...extraStats(closes, lows, price),
  };
}

/** Akcie (MSTR) — Yahoo Finance cez backend proxy `market-proxy`. */
async function fetchFromYahoo(ticker: string): Promise<TokenDailyIndicators> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-proxy?ticker=${encodeURIComponent(ticker)}`;
  const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '' } });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json() as { price: number; highs: number[]; lows: number[]; closes: number[] };
  if (!Array.isArray(j.closes) || j.closes.length < 40) throw new Error('insufficient candles');
  return fromOhlc(j.highs, j.lows, j.closes, Number(j.price) || 0, 'yahoo');
}

/** Živá cena + likvidita z DexScreener (pár s najväčšou likviditou, kde je token base). */
async function fetchDexScreener(address: string): Promise<{ price: number; liquidityUsd: number } | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (!r.ok) return null;
    const j = await r.json() as { pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number }; baseToken?: { address?: string } }> };
    const pairs = (j.pairs ?? [])
      .filter(p => String(p.baseToken?.address ?? '').toLowerCase() === address.toLowerCase())
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const top = pairs[0];
    const price = Number(top?.priceUsd);
    if (!(price > 0)) return null;
    return { price, liquidityUsd: Number(top?.liquidity?.usd) || 0 };
  } catch {
    return null;
  }
}

/** Smerovanie podľa koša: Yahoo (akcie) · DexScreener (low-cap) · Binance/CoinGecko. */
async function fetchDaily(symbol: string, cgId?: string | null): Promise<TokenDailyIndicators> {
  const meta = basketAsset(symbol);
  if (meta?.priceSource === 'coingecko') {
    const cg = await fetchFromCoinGecko(symbol, cgId || meta.cgId);
    if (!cg) throw new Error(`${symbol} coingecko unavailable`);
    return cg;
  }
  if (meta?.priceSource === 'yahoo') return fetchFromYahoo(meta.yahooTicker ?? symbol);
  const base = await fetchDailyCrypto(symbol, cgId || meta?.cgId || null);
  if (meta?.priceSource === 'dexscreener' && meta.dexAddress) {
    const dex = await fetchDexScreener(meta.dexAddress);
    if (dex) {
      const s200 = base.sma200;
      return {
        ...base,
        price: dex.price,
        smaDistPct: s200 > 0 ? ((dex.price - s200) / s200) * 100 : base.smaDistPct,
        livePriceSource: 'dexscreener',
        dexLiquidityUsd: dex.liquidityUsd,
      };
    }
  }
  return base;
}

/**
 * React-Query options factory — použiteľné aj v `useQueries` pre dynamický
 * počet tokenov (nové satelity pridané v Portfóliu).
 */
export function tokenDailyIndicatorsQuery(symbol: string, cgId?: string | null) {
  return {
    queryKey: ['token-daily-indicators', symbol.toUpperCase()] as const,
    queryFn: () => fetchDaily(symbol, cgId),
    refetchInterval: 60 * 1000,
    staleTime: 2 * 60 * 1000,
    retry: 1,
    retryDelay: 3000,
  };
}

/**
 * Generic daily indicator hook (SMA200, EMA50, RSI14, ATR14, 30D swing high/low).
 * Odstránený token (Portfólio → „Odstrániť token“) sa nikdy nefetchuje ani nepolluje.
 */
export function useTokenDailyIndicators(symbol: string, enabled = true, cgId?: string | null) {
  const removed = useTokenRemoved(symbol, cgId);
  return useQuery({
    ...tokenDailyIndicatorsQuery(symbol, cgId),
    enabled: enabled && !!symbol && !removed,
  });
}

