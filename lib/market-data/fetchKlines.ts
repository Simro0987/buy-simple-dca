export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
}

type RawKline = [number, string, string, string, string, string, ...unknown[]];

const BINANCE_KLINES_BASE = "https://data-api.binance.vision/api/v3/klines";

/** Daily bars needed for SMA 200 plus pivot/support context. */
export const BINANCE_KLINE_LIMIT = 250;

export async function fetchBinanceKlines(
  symbol: string,
  interval = "1d",
  limit = BINANCE_KLINE_LIMIT,
): Promise<OhlcBar[]> {
  const url = `${BINANCE_KLINES_BASE}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const json = (await res.json()) as RawKline[];
  return json.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}
