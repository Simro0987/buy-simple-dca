import { oracleValue } from './oracleRegistry';
export interface LivePrices {
  btc: number;
  eth: number;
  sol: number;
  updatedAt: number;
}

export function parseLivePrices(data: Record<string, { usd?: number }>, updatedAt = Date.now()): LivePrices {
  const btc = data.bitcoin?.usd;
  const eth = data.ethereum?.usd;
  const sol = data.solana?.usd;
  if (typeof btc !== 'number' || !Number.isFinite(btc) || btc <= 0 ||
      typeof eth !== 'number' || !Number.isFinite(eth) || eth <= 0 ||
      typeof sol !== 'number' || !Number.isFinite(sol) || sol <= 0) {
    throw new Error('Dáta cien nedostupné');
  }
  return { btc, eth, sol, updatedAt };
}

/** Averaged multi-source oracle (CoinGecko · Binance · Coinbase); never mock prices. */
export async function fetchLivePrices(): Promise<LivePrices> {
  const [btc, eth, sol] = await Promise.all([oracleValue('btcUsd'), oracleValue('ethUsd'), oracleValue('solUsd')]);
  return parseLivePrices({ bitcoin: { usd: btc ?? undefined }, ethereum: { usd: eth ?? undefined }, solana: { usd: sol ?? undefined } });
}
