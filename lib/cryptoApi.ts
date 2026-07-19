export type CryptoSymbol = "BTC" | "ETH" | "SOL";

export interface CryptoPrice {
  symbol: CryptoSymbol;
  price: number;
  change7d: number;
}

export type CryptoPricesMap = Record<CryptoSymbol, CryptoPrice>;

const COINGECKO_ID_MAP: Record<string, CryptoSymbol> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
};

const BINANCE_SYMBOL_MAP: Record<CryptoSymbol, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
};

export async function fetchCoinGeckoPrices(): Promise<CryptoPricesMap> {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&price_change_percentage=7d",
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`CoinGecko request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    id: string;
    current_price: number;
    price_change_percentage_7d_in_currency?: number;
  }[];

  const prices = {} as CryptoPricesMap;

  for (const coin of data) {
    const symbol = COINGECKO_ID_MAP[coin.id];
    if (!symbol) continue;

    prices[symbol] = {
      symbol,
      price: coin.current_price,
      change7d: coin.price_change_percentage_7d_in_currency ?? 0,
    };
  }

  if (!prices.BTC || !prices.ETH || !prices.SOL) {
    throw new Error("CoinGecko response missing required assets");
  }

  return prices;
}

export async function fetchBinancePrices(): Promise<CryptoPricesMap> {
  const entries = await Promise.all(
    (Object.keys(BINANCE_SYMBOL_MAP) as CryptoSymbol[]).map(async (symbol) => {
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${BINANCE_SYMBOL_MAP[symbol]}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(`Binance request failed for ${symbol}`);
      }

      const data = (await response.json()) as {
        lastPrice: string;
        priceChangePercent: string;
      };

      return {
        symbol,
        price: Number(data.lastPrice),
        change7d: Number(data.priceChangePercent),
      } satisfies CryptoPrice;
    }),
  );

  return Object.fromEntries(entries.map((entry) => [entry.symbol, entry])) as CryptoPricesMap;
}

export async function fetchCryptoPrices(): Promise<CryptoPricesMap> {
  try {
    return await fetchCoinGeckoPrices();
  } catch {
    return fetchBinancePrices();
  }
}
