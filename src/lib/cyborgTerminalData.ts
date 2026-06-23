import { cgFetch } from '@/lib/coingecko';
import { calcRsi14 } from '@/lib/cyborgTerminalEngine';

export interface CyborgMarketSnapshot {
  fearGreed: number;
  fearGreedClassification: string;
  btcRsi: number;
  prices: { btc: number; eth: number; sol: number };
  lbtcApy: number;
  usdcBorrowApy: number;
  kaminoApy: number;
  morphoLbtcApy: number;
  usedFallback: boolean;
  fallbackFields: string[];
  fetchedAt: Date;
}

export const CYBORG_MOCK: Omit<CyborgMarketSnapshot, 'fetchedAt' | 'usedFallback' | 'fallbackFields'> = {
  fearGreed: 32,
  fearGreedClassification: 'Fear',
  btcRsi: 41,
  prices: { btc: 98500, eth: 3450, sol: 178 },
  lbtcApy: 9.4,
  usdcBorrowApy: 5.1,
  kaminoApy: 7.8,
  morphoLbtcApy: 9.4,
};

interface LlamaPool {
  pool: string;
  project: string;
  symbol: string;
  chain: string;
  apy: number;
  apyBase?: number;
  apyBaseBorrow?: number;
}

async function fetchFearGreed(): Promise<{ value: number; classification: string } | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) throw new Error(`F&G ${res.status}`);
    const json = await res.json();
    return {
      value: parseInt(json.data[0].value, 10),
      classification: json.data[0].value_classification,
    };
  } catch {
    return null;
  }
}

async function fetchWeeklyBtcRsi(): Promise<number | null> {
  try {
    const res = await fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=30',
    );
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const rows = (await res.json()) as [number, string, string, string, string, ...unknown[]][];
    const closes = rows.map(r => parseFloat(r[4]));
    return calcRsi14(closes);
  } catch {
    return null;
  }
}

async function fetchPrices(): Promise<{ btc: number; eth: number; sol: number } | null> {
  try {
    const res = await cgFetch('/simple/price', {
      ids: 'bitcoin,ethereum,solana',
      vs_currencies: 'usd',
    });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const json = await res.json();
    return {
      btc: json.bitcoin?.usd ?? 0,
      eth: json.ethereum?.usd ?? 0,
      sol: json.solana?.usd ?? 0,
    };
  } catch {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd',
      );
      if (!res.ok) throw new Error('direct CG failed');
      const json = await res.json();
      return {
        btc: json.bitcoin?.usd ?? 0,
        eth: json.ethereum?.usd ?? 0,
        sol: json.solana?.usd ?? 0,
      };
    } catch {
      return null;
    }
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
    const val = apyField === 'apyBaseBorrow'
      ? (p.apyBaseBorrow ?? p.apy)
      : p.apy;
    if (Number.isFinite(val) && val > 0 && (best === null || val > best)) best = val;
  }
  return best;
}

async function fetchYields(): Promise<{
  lbtcApy: number | null;
  usdcBorrowApy: number | null;
  kaminoApy: number | null;
}> {
  try {
    const res = await fetch('https://yields.llama.fi/pools');
    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);
    const json = await res.json();
    const pools = (json.data ?? []) as LlamaPool[];

    const lbtcApy = pickBestPool(
      pools,
      p =>
        p.chain === 'Arbitrum' &&
        (p.symbol.toUpperCase().includes('LBTC') ||
          p.project.toLowerCase().includes('lombard') ||
          (p.project.toLowerCase().includes('morpho') && p.symbol.toUpperCase().includes('LBTC'))),
    );

    const usdcBorrowApy = pickBestPool(
      pools,
      p =>
        p.chain === 'Arbitrum' &&
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
      'apyBaseBorrow',
    ) ?? pickBestPool(
      pools,
      p =>
        p.chain === 'Arbitrum' &&
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
    );

    const kaminoApy = pickBestPool(
      pools,
      p =>
        p.chain === 'Solana' &&
        p.project.toLowerCase().includes('kamino') &&
        (p.symbol.toUpperCase().includes('SOL') || p.symbol.toUpperCase().includes('JITO')),
    );

    return { lbtcApy, usdcBorrowApy, kaminoApy };
  } catch {
    return { lbtcApy: null, usdcBorrowApy: null, kaminoApy: null };
  }
}

export async function fetchCyborgMarketData(): Promise<CyborgMarketSnapshot> {
  const fallbackFields: string[] = [];

  const [fg, rsi, prices, yields] = await Promise.all([
    fetchFearGreed(),
    fetchWeeklyBtcRsi(),
    fetchPrices(),
    fetchYields(),
  ]);

  const fearGreed = fg?.value ?? CYBORG_MOCK.fearGreed;
  if (!fg) fallbackFields.push('fearGreed');

  const btcRsi = rsi ?? CYBORG_MOCK.btcRsi;
  if (rsi === null) fallbackFields.push('btcRsi');

  const priceSnap = prices ?? CYBORG_MOCK.prices;
  if (!prices) fallbackFields.push('prices');

  const lbtcApy = yields.lbtcApy ?? CYBORG_MOCK.lbtcApy;
  if (yields.lbtcApy === null) fallbackFields.push('lbtcApy');

  const usdcBorrowApy = yields.usdcBorrowApy ?? CYBORG_MOCK.usdcBorrowApy;
  if (yields.usdcBorrowApy === null) fallbackFields.push('usdcBorrowApy');

  const kaminoApy = yields.kaminoApy ?? CYBORG_MOCK.kaminoApy;
  if (yields.kaminoApy === null) fallbackFields.push('kaminoApy');

  return {
    fearGreed,
    fearGreedClassification: fg?.classification ?? CYBORG_MOCK.fearGreedClassification,
    btcRsi,
    prices: priceSnap,
    lbtcApy,
    usdcBorrowApy,
    kaminoApy,
    morphoLbtcApy: lbtcApy,
    usedFallback: fallbackFields.length > 0,
    fallbackFields,
    fetchedAt: new Date(),
  };
}
