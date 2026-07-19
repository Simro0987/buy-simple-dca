export type CryptoSymbol = "BTC" | "ETH" | "SOL";

export interface CryptoPrice {
  symbol: string;
  coingeckoId: string;
  price: number;
  change7d: number;
  image?: string;
}

export type CryptoPricesMap = Record<CryptoSymbol, CryptoPrice>;
export type DynamicPricesMap = Record<string, CryptoPrice>;

export interface CoinGeckoSearchCoin {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  large: string;
}

export interface CoinGeckoSearchResult {
  coins: CoinGeckoSearchCoin[];
}

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

const CORE_COINGECKO_IDS = ["bitcoin", "ethereum", "solana"];

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function searchCoinGecko(
  query: string,
): Promise<CoinGeckoSearchCoin[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const data = await fetchJson<CoinGeckoSearchResult>(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(trimmed)}`,
  );

  return (data.coins ?? []).slice(0, 12);
}

export async function fetchCoinGeckoPricesByIds(
  ids: string[],
): Promise<DynamicPricesMap> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    chunks.push(uniqueIds.slice(i, i + 50));
  }

  const prices: DynamicPricesMap = {};

  for (const chunk of chunks) {
    const data = await fetchJson<
      {
        id: string;
        symbol: string;
        image: string;
        current_price: number;
        price_change_percentage_7d_in_currency?: number;
      }[]
    >(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${chunk.join(",")}&price_change_percentage=7d`,
    );

    for (const coin of data) {
      prices[coin.id] = {
        symbol: coin.symbol.toUpperCase(),
        coingeckoId: coin.id,
        price: coin.current_price ?? 0,
        change7d: coin.price_change_percentage_7d_in_currency ?? 0,
        image: coin.image,
      };
    }
  }

  return prices;
}

export async function fetchCoinGeckoPrices(): Promise<CryptoPricesMap> {
  const dynamic = await fetchCoinGeckoPricesByIds(CORE_COINGECKO_IDS);
  const prices = {} as CryptoPricesMap;

  for (const [id, symbol] of Object.entries(COINGECKO_ID_MAP)) {
    const entry = dynamic[id];
    if (!entry) continue;
    prices[symbol] = { ...entry, symbol };
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

      const coingeckoId =
        symbol === "BTC"
          ? "bitcoin"
          : symbol === "ETH"
            ? "ethereum"
            : "solana";

      return {
        symbol,
        coingeckoId,
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

export async function fetchPortfolioPrices(
  coingeckoIds: string[],
): Promise<DynamicPricesMap> {
  try {
    return await fetchCoinGeckoPricesByIds(coingeckoIds);
  } catch {
    const core = await fetchCryptoPrices();
    const fallback: DynamicPricesMap = {};
    for (const price of Object.values(core)) {
      fallback[price.coingeckoId] = price;
    }
    return fallback;
  }
}
