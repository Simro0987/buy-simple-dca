import { cgFetch } from '@/lib/coingecko';
import { calcRsi14 } from '@/lib/cyborgTerminalEngine';
import { API_OFFLINE } from '@/lib/cyborgBlockchain';
import { fetchWithCache } from '@/lib/apiCache';

export interface CyborgMarketSnapshot {
  fearGreed: number | null;
  fearGreedClassification: string | null;
  btcRsi: number | null;
  prices: { btc: number | null; eth: number | null; sol: number | null };
  lbtcApy: number | null;
  usdcBorrowApy: number | null;
  kaminoApy: number | null;
  lbtcPriceUsd: number | null;
  errors: string[];
  stale: boolean;
  fetchedAt: Date;
}

interface LlamaPool {
  pool: string;
  project: string;
  symbol: string;
  chain: string;
  apy: number;
  apyBaseBorrow?: number;
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

async function fetchPricesWithFailover(): Promise<{ btc: number; eth: number; sol: number; lbtcPriceUsd: number | null }> {
  try {
    const res = await cgFetch('/simple/price', {
      ids: 'bitcoin,ethereum,solana,lombard-staked-btc',
      vs_currencies: 'usd',
    });
    if (!res.ok) throw new Error('CG proxy failed');
    const json = await res.json();
    return {
      btc: json.bitcoin?.usd ?? 0,
      eth: json.ethereum?.usd ?? 0,
      sol: json.solana?.usd ?? 0,
      lbtcPriceUsd: json['lombard-staked-btc']?.usd ?? json.bitcoin?.usd ?? null,
    };
  } catch {
    const res = await fetch(
      'https://coins.llama.fi/prices/current/coingecko:bitcoin,coingecko:ethereum,coingecko:solana',
    );
    if (!res.ok) throw new Error('DefiLlama prices failed');
    const json = await res.json();
    const coins = json.coins ?? {};
    const prices = {
      btc: coins['coingecko:bitcoin']?.price ?? 0,
      eth: coins['coingecko:ethereum']?.price ?? 0,
      sol: coins['coingecko:solana']?.price ?? 0,
    };
    return { ...prices, lbtcPriceUsd: prices.btc };
  }
}

function pickBestPool(
  pools: LlamaPool[],
  filter: (p: LlamaPool) => boolean,
  apyField: 'apy' | 'apyBaseBorrow' = 'apy',
): number | null {
  let best: number | null = null;
  for (const p of pools) {
    if (!filter(p)) continue;
    const val = apyField === 'apyBaseBorrow' ? (p.apyBaseBorrow ?? p.apy) : p.apy;
    if (Number.isFinite(val) && val > 0 && (best === null || val > best)) best = val;
  }
  return best;
}

async function fetchYieldsLive(): Promise<{
  lbtcApy: number | null;
  usdcBorrowApy: number | null;
  kaminoApy: number | null;
}> {
  const res = await fetch('https://yields.llama.fi/pools');
  if (!res.ok) throw new Error(`DefiLlama yields ${res.status}`);
  const json = await res.json();
  const pools = (json.data ?? []) as LlamaPool[];

  return {
    lbtcApy: pickBestPool(
      pools,
      p =>
        p.chain === 'Arbitrum' &&
        (p.symbol.toUpperCase().includes('LBTC') ||
          p.project.toLowerCase().includes('lombard') ||
          (p.project.toLowerCase().includes('morpho') && p.symbol.toUpperCase().includes('LBTC'))),
    ),
    usdcBorrowApy:
      pickBestPool(
        pools,
        p =>
          p.chain === 'Arbitrum' &&
          p.project.toLowerCase().includes('morpho') &&
          p.symbol.toUpperCase().includes('USDC'),
        'apyBaseBorrow',
      ) ??
      pickBestPool(
        pools,
        p =>
          p.chain === 'Arbitrum' &&
          p.project.toLowerCase().includes('morpho') &&
          p.symbol.toUpperCase().includes('USDC'),
      ),
    kaminoApy: pickBestPool(
      pools,
      p =>
        p.chain === 'Solana' &&
        p.project.toLowerCase().includes('kamino') &&
        (p.symbol.toUpperCase().includes('SOL') || p.symbol.toUpperCase().includes('JITO')),
    ),
  };
}

export async function fetchCyborgMarketData(opts?: { force?: boolean }): Promise<CyborgMarketSnapshot> {
  const errors: string[] = [];
  let stale = false;

  const fgResult = await fetchWithCache(
    'cyborg-fng',
    fetchFearGreedLive,
    { force: opts?.force },
  ).catch(() => ({ data: null, fromCache: false, stale: false }));
  if (!fgResult.data) errors.push(API_OFFLINE);
  if (fgResult.stale) stale = true;

  const rsiResult = await fetchWithCache(
    'cyborg-btc-rsi-w',
    fetchWeeklyBtcRsiLive,
    { force: opts?.force },
  ).catch(() => ({ data: null, fromCache: false, stale: false }));
  if (rsiResult.data === null) errors.push(API_OFFLINE);
  if (rsiResult.stale) stale = true;

  const pricesResult = await fetchWithCache(
    'cyborg-prices',
    fetchPricesWithFailover,
    { force: opts?.force },
  ).catch(() => ({ data: null, fromCache: false, stale: false }));
  if (!pricesResult.data) errors.push(API_OFFLINE);
  if (pricesResult.stale) stale = true;

  const yieldsResult = await fetchWithCache(
    'cyborg-yields',
    fetchYieldsLive,
    { force: opts?.force },
  ).catch(() => ({ data: null, fromCache: false, stale: false }));
  if (!yieldsResult.data) errors.push(API_OFFLINE);
  if (yieldsResult.stale) stale = true;

  return {
    fearGreed: fgResult.data?.value ?? null,
    fearGreedClassification: fgResult.data?.classification ?? null,
    btcRsi: rsiResult.data ?? null,
    prices: {
      btc: pricesResult.data?.btc ?? null,
      eth: pricesResult.data?.eth ?? null,
      sol: pricesResult.data?.sol ?? null,
    },
    lbtcPriceUsd: pricesResult.data?.lbtcPriceUsd ?? null,
    lbtcApy: yieldsResult.data?.lbtcApy ?? null,
    usdcBorrowApy: yieldsResult.data?.usdcBorrowApy ?? null,
    kaminoApy: yieldsResult.data?.kaminoApy ?? null,
    errors: [...new Set(errors)],
    stale,
    fetchedAt: new Date(),
  };
}
