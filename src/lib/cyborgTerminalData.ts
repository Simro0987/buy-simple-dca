import { calcRsi14 } from '@/lib/cyborgTerminalEngine';
import { fetchWithCache, readStaleCache } from '@/lib/apiCache';
import {
  DATA_UNAVAILABLE,
  extractTerminalExclusiveYields,
  fetchDefiLlamaPrices,
  fetchLlamaPools,
} from '@/lib/defiLlamaAggregator';

export { DATA_UNAVAILABLE };

export interface CyborgMarketSnapshot {
  fearGreed: number | null;
  fearGreedClassification: string | null;
  btcRsi: number | null;
  prices: { btc: number | null; eth: number | null; sol: number | null };
  lbtcApy: number | null;
  usdcBorrowApy: number | null;
  lbtcPriceUsd: number | null;
  /** Per-source availability — never blocks portfolio balances */
  unavailable: string[];
  stale: boolean;
  fetchedAt: Date;
  ready: boolean;
}

async function fetchFearGreedLive(): Promise<{ value: number; classification: string }> {
  const res = await fetch('https://api.alternative.me/fng/?limit=1');
  if (!res.ok) throw new Error(`F&G ${res.status}`);
  const json = await res.json();
  return {
    value: parseInt(json.data[0].value, 10),
    classification: json.data[0].value_classification,
  };
}

async function fetchWeeklyBtcRsiLive(): Promise<number> {
  const res = await fetch(
    'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=30',
  );
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const rows = (await res.json()) as [number, string, string, string, string, ...unknown[]][];
  return calcRsi14(rows.map(r => parseFloat(r[4])));
}

async function fetchTerminalYieldsFromLlama() {
  const pools = await fetchLlamaPools();
  return extractTerminalExclusiveYields(pools);
}

type CacheResult<T> = { data: T; fromCache: boolean; stale: boolean };

async function safeCacheFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  force?: boolean,
): Promise<CacheResult<T> | null> {
  try {
    return await fetchWithCache(key, fetcher, { force, allowStaleOnError: true });
  } catch {
    const stale = readStaleCache<T>(key);
    if (stale !== null) return { data: stale, fromCache: true, stale: true };
    return null;
  }
}

export async function fetchCyborgMarketData(opts?: { force?: boolean }): Promise<CyborgMarketSnapshot> {
  const unavailable: string[] = [];
  let stale = false;

  const [fgSettled, rsiSettled, pricesSettled, yieldsSettled] = await Promise.allSettled([
    safeCacheFetch('cyborg-fng', fetchFearGreedLive, opts?.force),
    safeCacheFetch('cyborg-btc-rsi-w', fetchWeeklyBtcRsiLive, opts?.force),
    safeCacheFetch('cyborg-prices', fetchDefiLlamaPrices, opts?.force),
    safeCacheFetch('cyborg-terminal-yields', fetchTerminalYieldsFromLlama, opts?.force),
  ]);

  let fearGreed: number | null = null;
  let fearGreedClassification: string | null = null;
  if (fgSettled.status === 'fulfilled' && fgSettled.value?.data) {
    fearGreed = fgSettled.value.data.value;
    fearGreedClassification = fgSettled.value.data.classification;
    if (fgSettled.value.stale) stale = true;
  } else {
    unavailable.push('Fear & Greed');
  }

  let btcRsi: number | null = null;
  if (rsiSettled.status === 'fulfilled' && rsiSettled.value?.data != null) {
    btcRsi = rsiSettled.value.data;
    if (rsiSettled.value.stale) stale = true;
  } else {
    unavailable.push('BTC RSI');
  }

  let prices: { btc: number | null; eth: number | null; sol: number | null } = {
    btc: null,
    eth: null,
    sol: null,
  };
  let lbtcPriceUsd: number | null = null;
  if (pricesSettled.status === 'fulfilled' && pricesSettled.value?.data) {
    const p = pricesSettled.value.data;
    prices = { btc: p.btc, eth: p.eth, sol: p.sol };
    lbtcPriceUsd = p.lbtcPriceUsd;
    if (pricesSettled.value.stale) stale = true;
  } else {
    unavailable.push('Prices');
  }

  let lbtcApy: number | null = null;
  let usdcBorrowApy: number | null = null;

  if (yieldsSettled.status === 'fulfilled' && yieldsSettled.value?.data) {
    const y = yieldsSettled.value.data;
    lbtcApy = y.lbtcApy;
    usdcBorrowApy = y.usdcBorrowApy;
    for (const name of y.unavailable) {
      if (!unavailable.includes(name)) unavailable.push(name);
    }
    if (yieldsSettled.value.stale) stale = true;
  } else {
    unavailable.push('DefiLlama Yields');
  }

  return {
    fearGreed,
    fearGreedClassification,
    btcRsi,
    prices,
    lbtcApy,
    usdcBorrowApy,
    lbtcPriceUsd,
    unavailable: [...new Set(unavailable)],
    stale,
    fetchedAt: new Date(),
    ready: true,
  };
}
