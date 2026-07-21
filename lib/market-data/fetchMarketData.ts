import type {
  NormalizedPricesMap,
  NormalizedTokenPrice,
  PriceFetchResult,
  PriceSource,
} from "@/lib/price/types";

export interface MarketTokenInput {
  symbol: string;
  coingeckoId: string;
  name?: string;
}

export interface MarketDataResponse {
  prices: NormalizedPricesMap;
  source: PriceSource;
  degraded: boolean;
  fetchedAt: string;
}

const CORE_TOKENS: MarketTokenInput[] = [
  { symbol: "BTC", coingeckoId: "bitcoin", name: "Bitcoin" },
  { symbol: "ETH", coingeckoId: "ethereum", name: "Ethereum" },
  { symbol: "SOL", coingeckoId: "solana", name: "Solana" },
];

async function safeFetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function buildEmptyMap(
  tokens: MarketTokenInput[],
  source: PriceSource,
): NormalizedPricesMap {
  const now = new Date().toISOString();
  const map: NormalizedPricesMap = {};
  for (const token of tokens) {
    map[token.coingeckoId] = {
      symbol: token.symbol.toUpperCase(),
      coingeckoId: token.coingeckoId,
      name: token.name,
      price: 0,
      change24h: 0,
      change7d: 0,
      marketCap: 0,
      source,
      fetchedAt: now,
    };
  }
  return map;
}

function normalizeCoinGecko(
  tokens: MarketTokenInput[],
  data: Array<{
    id: string;
    symbol: string;
    name: string;
    image: string;
    current_price: number;
    market_cap: number;
    market_cap_rank?: number;
    price_change_percentage_24h_in_currency?: number;
    price_change_percentage_7d_in_currency?: number;
  }>,
): NormalizedPricesMap {
  const map = buildEmptyMap(tokens, "coingecko");
  const now = new Date().toISOString();

  for (const coin of data) {
    map[coin.id] = {
      symbol: coin.symbol.toUpperCase(),
      coingeckoId: coin.id,
      name: coin.name,
      price: coin.current_price ?? 0,
      change24h: coin.price_change_percentage_24h_in_currency ?? 0,
      change7d: coin.price_change_percentage_7d_in_currency ?? 0,
      marketCap: coin.market_cap ?? 0,
      marketCapRank: coin.market_cap_rank,
      image: coin.image,
      source: "coingecko",
      fetchedAt: now,
    };
  }
  return map;
}

function normalizeMobula(
  tokens: MarketTokenInput[],
  rows: Array<{
    name?: string;
    symbol?: string;
    price?: number;
    price_change_24h?: number;
    market_cap?: number;
    logo?: string;
  }>,
): NormalizedPricesMap {
  const map = buildEmptyMap(tokens, "mobula");
  const now = new Date().toISOString();
  const bySymbol = new Map(
    rows.map((row) => [String(row.symbol ?? "").toUpperCase(), row]),
  );

  for (const token of tokens) {
    const row =
      bySymbol.get(token.symbol.toUpperCase()) ??
      rows.find(
        (r) =>
          String(r.name ?? "").toLowerCase() ===
          token.coingeckoId.toLowerCase(),
      );
    if (!row?.price || row.price <= 0) continue;

    map[token.coingeckoId] = {
      symbol: token.symbol.toUpperCase(),
      coingeckoId: token.coingeckoId,
      name: row.name ?? token.name,
      price: row.price,
      change24h: row.price_change_24h ?? 0,
      change7d: 0,
      marketCap: row.market_cap ?? 0,
      image: row.logo,
      source: "mobula",
      fetchedAt: now,
    };
  }
  return map;
}

function normalizeCoinMarketCap(
  tokens: MarketTokenInput[],
  data: Record<
    string,
    {
      name: string;
      symbol: string;
      quote?: {
        USD?: {
          price?: number;
          percent_change_24h?: number;
          percent_change_7d?: number;
          market_cap?: number;
        };
      };
    }
  >,
): NormalizedPricesMap {
  const map = buildEmptyMap(tokens, "coinmarketcap");
  const now = new Date().toISOString();

  for (const token of tokens) {
    const entry = data[token.symbol.toUpperCase()];
    const usd = entry?.quote?.USD;
    if (!usd?.price) continue;

    map[token.coingeckoId] = {
      symbol: token.symbol.toUpperCase(),
      coingeckoId: token.coingeckoId,
      name: entry.name ?? token.name,
      price: usd.price,
      change24h: usd.percent_change_24h ?? 0,
      change7d: usd.percent_change_7d ?? 0,
      marketCap: usd.market_cap ?? 0,
      source: "coinmarketcap",
      fetchedAt: now,
    };
  }
  return map;
}

function hasValidPrices(map: NormalizedPricesMap): boolean {
  return Object.values(map).some((p) => p.price > 0);
}

async function fetchCoinGeckoRace(
  tokens: MarketTokenInput[],
): Promise<{ source: PriceSource; prices: NormalizedPricesMap }> {
  const ids = [...new Set(tokens.map((t) => t.coingeckoId))].join(",");
  const data = await safeFetchJson<
    Parameters<typeof normalizeCoinGecko>[1]
  >(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h,7d`,
  );

  if (!data?.length) throw new Error("CoinGecko failed");
  const prices = normalizeCoinGecko(tokens, data);
  if (!hasValidPrices(prices)) throw new Error("CoinGecko empty");
  return { source: "coingecko", prices };
}

async function fetchMobulaRace(
  tokens: MarketTokenInput[],
): Promise<{ source: PriceSource; prices: NormalizedPricesMap }> {
  const assets = [...new Set(tokens.map((t) => t.coingeckoId))].join(",");
  const data = await safeFetchJson<{
    data?: Parameters<typeof normalizeMobula>[1];
  }>(
    `https://api.mobula.io/api/1/market/multi-data?assets=${encodeURIComponent(assets)}`,
  );

  const rows = data?.data;
  if (!rows?.length) throw new Error("Mobula failed");
  const prices = normalizeMobula(tokens, rows);
  if (!hasValidPrices(prices)) throw new Error("Mobula empty");
  return { source: "mobula", prices };
}

async function fetchCoinMarketCapRace(
  tokens: MarketTokenInput[],
): Promise<{ source: PriceSource; prices: NormalizedPricesMap }> {
  const apiKey =
    process.env.COINMARKETCAP_API_KEY ??
    process.env.VITE_COINMARKETCAP_API_KEY;
  if (!apiKey) throw new Error("CMC key missing");

  const symbols = [...new Set(tokens.map((t) => t.symbol.toUpperCase()))].join(
    ",",
  );
  const data = await safeFetchJson<{
    data?: Parameters<typeof normalizeCoinMarketCap>[1];
  }>(
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbols}`,
    { headers: { "X-CMC_PRO_API_KEY": apiKey } },
  );

  if (!data?.data) throw new Error("CMC failed");
  const prices = normalizeCoinMarketCap(tokens, data.data);
  if (!hasValidPrices(prices)) throw new Error("CMC empty");
  return { source: "coinmarketcap", prices };
}

export async function fetchMarketDataRace(
  tokens: MarketTokenInput[] = CORE_TOKENS,
): Promise<MarketDataResponse> {
  const racers = [
    fetchCoinGeckoRace(tokens),
    fetchMobulaRace(tokens),
    fetchCoinMarketCapRace(tokens),
  ];

  try {
    const winner = await Promise.any(racers);
    return {
      prices: winner.prices,
      source: winner.source,
      degraded: false,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    // Promise.any throws AggregateError when all fail — try sequential merge
    let merged = buildEmptyMap(tokens, "coingecko");
    let source: PriceSource = "coingecko";
    let anySuccess = false;

    for (const racer of racers) {
      try {
        const result = await racer;
        merged = { ...merged, ...result.prices };
        source = result.source;
        anySuccess = true;
        if (tokens.every((t) => (merged[t.coingeckoId]?.price ?? 0) > 0)) {
          break;
        }
      } catch {
        // continue
      }
    }

    return {
      prices: merged,
      source,
      degraded: !anySuccess || !hasValidPrices(merged),
      fetchedAt: new Date().toISOString(),
    };
  }
}

export async function searchCoinsServer(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const data = await safeFetchJson<{
    coins?: Array<{
      id: string;
      name: string;
      symbol: string;
      thumb: string;
      large: string;
    }>;
  }>(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(trimmed)}`,
  );

  return (data?.coins ?? []).slice(0, 12);
}

export function parseMarketTokens(
  idsParam: string | null,
  symbolsParam: string | null,
): MarketTokenInput[] {
  if (!idsParam) return CORE_TOKENS;

  const ids = idsParam.split(",").filter(Boolean);
  const symbols = symbolsParam?.split(",") ?? [];

  return ids.map((id, index) => ({
    coingeckoId: id,
    symbol: symbols[index]?.toUpperCase() ?? id.slice(0, 4).toUpperCase(),
    name: symbols[index] ?? id,
  }));
}

export function toLegacyCryptoPrices(
  prices: NormalizedPricesMap,
): Record<"BTC" | "ETH" | "SOL", NormalizedTokenPrice> {
  const fallback = (symbol: string, coingeckoId: string): NormalizedTokenPrice => ({
    symbol,
    coingeckoId,
    price: 0,
    change24h: 0,
    change7d: 0,
    marketCap: 0,
    source: "coingecko",
    fetchedAt: new Date().toISOString(),
  });

  return {
    BTC: prices.bitcoin ?? fallback("BTC", "bitcoin"),
    ETH: prices.ethereum ?? fallback("ETH", "ethereum"),
    SOL: prices.solana ?? fallback("SOL", "solana"),
  };
}
