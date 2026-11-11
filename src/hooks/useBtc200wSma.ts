import { useQuery } from '@tanstack/react-query';

export interface Btc200wData { price: number; sma200w: number; source: 'binance' | 'yahoo'; weeks: number }

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

async function fetchBtc200w(): Promise<Btc200wData> {
  const [kr, tr] = await Promise.all([
    fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=200'),
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
  ]);
  if (!kr.ok) throw new Error(`binance ${kr.status}`);
  const raw = (await kr.json()) as Array<[number, string, string, string, string]>;
  const closes = raw.map((k) => Number(k[4])).filter((n) => n > 0);
  if (closes.length < 150) throw new Error('few');
  const live = tr.ok ? Number(((await tr.json()) as { price?: string }).price) : NaN;
  const price = Number.isFinite(live) && live > 0 ? live : closes[closes.length - 1];
  return { price, sma200w: avg(closes.slice(-200)), source: 'binance', weeks: closes.length };
}

/** BTC live cena (Binance ticker) a 200-týždňová SMA (Binance 1w sviečky). */
export function useBtc200wSma() {
  return useQuery({ queryKey: ['btc-200w-sma'], queryFn: fetchBtc200w, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 2 });
}
