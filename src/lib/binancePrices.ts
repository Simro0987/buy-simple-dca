export interface BinanceCorePrices {
  btc: number;
  eth: number;
  sol: number;
  source: 'binance' | 'unavailable';
}

interface BinanceTicker {
  symbol: string;
  price: string;
}

async function fetchTicker(symbol: string): Promise<number> {
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance ${symbol} ${res.status}`);
  const json = (await res.json()) as Partial<BinanceTicker> & { code?: number; msg?: string };
  if (json.code !== undefined) {
    throw new Error(json.msg ?? `Binance ${symbol} blocked`);
  }
  const price = parseFloat(json.price ?? '');
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Binance ${symbol} invalid price`);
  return price;
}

/** Live BTC/ETH/SOL spot from Binance public ticker API. */
export async function fetchBinanceCorePrices(): Promise<BinanceCorePrices> {
  const [btc, eth, sol] = await Promise.all([
    fetchTicker('BTCUSDT'),
    fetchTicker('ETHUSDT'),
    fetchTicker('SOLUSDT'),
  ]);
  return { btc, eth, sol, source: 'binance' };
}
