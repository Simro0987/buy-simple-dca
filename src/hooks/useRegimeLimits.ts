import { useQuery } from '@tanstack/react-query';
import type { CoinKey } from '@/lib/dynamicExecution';

/**
 * REGIME-BASED LIMIT ENGINE (7-day investor)
 * ------------------------------------------
 * Pre každý coin vypočíta limitnú cenu na základe 50D EMA režimu:
 *
 *  • BÝK   (cena > EMA50) → pullback limit
 *      BTC: −2.5 %, ETH/SOL: −4.0 %
 *
 *  • MEDVEĎ (cena < EMA50) → loviť knôty pod 7D supportom
 *      BTC: presne 7D low
 *      ETH/SOL: 7D low − 0.5 × ATR7
 *
 *  • Failsafe: výsledný drop vždy zatvorený do [2.0 %, 7.5 %]
 *
 * Zdroj dát: Binance public REST (CORS-friendly). Pri zlyhaní vraciame
 * konzervatívny fallback (BTC −3 %, ETH −4.5 %, SOL −5.5 %) bez UI crashu.
 */

const SYMBOL: Record<CoinKey, string> = {
  btc: 'BTCUSDT',
  eth: 'ETHUSDT',
  sol: 'SOLUSDT',
};

const BULL_PULLBACK_PCT: Record<CoinKey, number> = {
  btc: 2.5,
  eth: 4.0,
  sol: 4.0,
};

const FALLBACK_DROP_PCT: Record<CoinKey, number> = {
  btc: 3.0,
  eth: 4.5,
  sol: 5.5,
};

const MIN_DROP_PCT = 2.0;
const MAX_DROP_PCT = 7.5;

export type Regime = 'bull' | 'bear';

export interface RegimeLimitInfo {
  regime: Regime;
  price: number;
  ema50: number;
  /** 7-dňové low z uzavretých sviečok. */
  sevenDayLow: number;
  /** 7-dňové ATR z uzavretých sviečok. */
  atr7: number;
  limitPrice: number;
  discountPct: number;
  reason: string;
  clamped: boolean;
  fallback: boolean;
}

type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  if (values.length < period) {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }
  const k = 2 / (period + 1);
  // Seed with SMA of first `period` values
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function atr7(highs: number[], lows: number[], closes: number[]): number {
  const n = closes.length;
  if (n < 8) return 0;
  const trs: number[] = [];
  for (let i = n - 7; i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function buildFallback(coin: CoinKey, price: number): RegimeLimitInfo {
  const drop = FALLBACK_DROP_PCT[coin];
  return {
    regime: 'bull',
    price,
    ema50: 0,
    sevenDayLow: 0,
    atr7: 0,
    limitPrice: price > 0 ? price * (1 - drop / 100) : 0,
    discountPct: drop,
    reason: 'Dáta z Binance momentálne nedostupné. Používame konzervatívny fallback limit, aby cyklus akumulácie nestál.',
    clamped: false,
    fallback: true,
  };
}

async function fetchRegimeForCoin(coin: CoinKey, livePrice: number): Promise<RegimeLimitInfo> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${SYMBOL[coin]}&interval=1d&limit=100`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const raw = (await res.json()) as BinanceKline[];
    if (!Array.isArray(raw) || raw.length < 20) throw new Error('insufficient klines');

    const closes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    for (const k of raw) {
      const c = parseFloat(k[4]);
      const h = parseFloat(k[2]);
      const l = parseFloat(k[3]);
      if (Number.isFinite(c) && c > 0) { closes.push(c); highs.push(h); lows.push(l); }
    }
    if (closes.length < 20) throw new Error('insufficient closes');

    const price = livePrice > 0 ? livePrice : closes[closes.length - 1];
    const ema50 = ema(closes, 50);
    const regime: Regime = price >= ema50 ? 'bull' : 'bear';

    // 7d low/ATR exkluduje aktuálne (live) ešte neuzavretý sviečku
    const completedHighs = highs.slice(0, -1);
    const completedLows  = lows.slice(0, -1);
    const completedCloses = closes.slice(0, -1);
    const last7Lows = completedLows.slice(-7);
    const sevenDayLow = last7Lows.length > 0 ? Math.min(...last7Lows) : price;
    const atr = atr7(completedHighs, completedLows, completedCloses);

    let rawLimit: number;
    if (regime === 'bull') {
      rawLimit = price * (1 - BULL_PULLBACK_PCT[coin] / 100);
    } else if (coin === 'btc') {
      rawLimit = sevenDayLow;
    } else {
      rawLimit = sevenDayLow - 0.5 * atr;
    }

    let dropPct = price > 0 ? ((price - rawLimit) / price) * 100 : 0;
    const clamped = dropPct < MIN_DROP_PCT || dropPct > MAX_DROP_PCT;
    dropPct = clamp(dropPct, MIN_DROP_PCT, MAX_DROP_PCT);
    const limitPrice = price * (1 - dropPct / 100);

    const reason = regime === 'bull'
      ? `Trh je nad 50D EMA — rastúci trend. Cielime na ${dropPct.toFixed(1)} % pullback, aby nám akumulácia neušla a kapitál pracoval.`
      : `Trh je pod 50D EMA — výplachy. Čakáme na výber likvidity ${coin === 'btc' ? 'na 7D supporte' : 'pod 7D supportom (− 0.5×ATR7)'}, aby sme nakúpili vo výhodnejšej zóne.`;

    return { regime, price, ema50, limitPrice, discountPct: dropPct, reason, clamped, fallback: false };
  } catch {
    return buildFallback(coin, livePrice);
  }
}

/**
 * Hook pre regime-based limit engine.
 * `livePrices` je voliteľné — ak je dodané, použije sa namiesto posledného Binance close
 * pre presnejšie zobrazenie.
 */
export function useRegimeLimits(livePrices?: Partial<Record<CoinKey, number>>) {
  return useQuery<Record<CoinKey, RegimeLimitInfo>>({
    queryKey: ['regime-limits-v1'],
    queryFn: async () => {
      const coins: CoinKey[] = ['btc', 'eth', 'sol'];
      const out: Partial<Record<CoinKey, RegimeLimitInfo>> = {};
      for (const c of coins) {
        out[c] = await fetchRegimeForCoin(c, livePrices?.[c] ?? 0);
      }
      return out as Record<CoinKey, RegimeLimitInfo>;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
