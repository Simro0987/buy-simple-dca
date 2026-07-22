export type CryptoSymbol = "BTC" | "ETH" | "SOL";

export interface CryptoPrice {
  symbol: string;
  coingeckoId: string;
  price: number;
  change7d: number;
  change24h?: number;
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

export interface MarketDataApiResponse {
  success: boolean;
  prices?: Record<
    string,
    {
      symbol: string;
      coingeckoId: string;
      price: number;
      change24h: number;
      change7d: number;
      image?: string;
    }
  >;
  core?: Record<
    CryptoSymbol,
    {
      symbol: string;
      coingeckoId: string;
      price: number;
      change24h: number;
      change7d: number;
      image?: string;
    }
  >;
  coins?: CoinGeckoSearchCoin[];
  source?: string;
  degraded?: boolean;
  error?: string;
  fetchedAt?: string;
}

const COINGECKO_ID_MAP: Record<string, CryptoSymbol> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
};

const CORE_COINGECKO_IDS = ["bitcoin", "ethereum", "solana"];

async function fetchMarketDataApi(
  coingeckoIds?: string[],
  symbols?: string[],
): Promise<MarketDataApiResponse> {
  const params = new URLSearchParams();
  if (coingeckoIds?.length) {
    params.set("ids", coingeckoIds.join(","));
    if (symbols?.length) params.set("symbols", symbols.join(","));
  }
  const query = params.toString();
  const response = await fetch(`/api/market-data${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  return response.json() as Promise<MarketDataApiResponse>;
}

function mapToCryptoPrice(entry: {
  symbol: string;
  coingeckoId: string;
  price: number;
  change7d: number;
  change24h?: number;
  image?: string;
}): CryptoPrice {
  return {
    symbol: entry.symbol,
    coingeckoId: entry.coingeckoId,
    price: entry.price,
    change7d: entry.change7d,
    change24h: entry.change24h,
    image: entry.image,
  };
}

export async function searchCoinGecko(
  query: string,
): Promise<CoinGeckoSearchCoin[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const data = await fetch(
    `/api/market-data?action=search&query=${encodeURIComponent(trimmed)}`,
    { cache: "no-store" },
  );
  const json = (await data.json()) as MarketDataApiResponse;
  return json.coins ?? [];
}

export async function fetchCoinGeckoPricesByIds(
  ids: string[],
  symbols?: string[],
): Promise<DynamicPricesMap> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const sym =
    symbols ??
    uniqueIds.map((id) => {
      const entry = Object.entries(COINGECKO_ID_MAP).find(([k]) => k === id);
      return entry?.[1] ?? id.slice(0, 4).toUpperCase();
    });

  const data = await fetchMarketDataApi(uniqueIds, sym);
  if (!data.success || !data.prices) {
    throw new Error(data.error ?? "Market data fetch failed");
  }

  const prices: DynamicPricesMap = {};
  for (const [id, entry] of Object.entries(data.prices)) {
    prices[id] = mapToCryptoPrice(entry);
  }
  return prices;
}

export async function fetchCoinGeckoPrices(): Promise<CryptoPricesMap> {
  const data = await fetchMarketDataApi(CORE_COINGECKO_IDS, ["BTC", "ETH", "SOL"]);
  if (!data.success || !data.core) {
    throw new Error(data.error ?? "Core market data fetch failed");
  }

  const prices = {} as CryptoPricesMap;
  for (const [id, symbol] of Object.entries(COINGECKO_ID_MAP)) {
    const entry = data.prices?.[id] ?? data.core[symbol];
    if (!entry) continue;
    prices[symbol] = { ...mapToCryptoPrice(entry), symbol };
  }

  if (!prices.BTC || !prices.ETH || !prices.SOL) {
    throw new Error("Market data response missing required assets");
  }

  return prices;
}

export async function fetchCryptoPrices(): Promise<CryptoPricesMap> {
  return fetchCoinGeckoPrices();
}

export async function fetchPortfolioPrices(
  coingeckoIds: string[],
  symbols?: string[],
): Promise<DynamicPricesMap> {
  return fetchCoinGeckoPricesByIds(coingeckoIds, symbols);
}
