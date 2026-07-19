import {
  isCircuitOpen,
  recordSourceFailure,
  recordSourceSuccess,
} from "@/lib/price/circuitBreaker";
import type {
  NormalizedPricesMap,
  NormalizedTokenPrice,
  PriceFetchResult,
  PriceSource,
} from "@/lib/price/types";

export interface PriceTokenInput {
  symbol: string;
  coingeckoId: string;
  name?: string;
}

const PRICE_CACHE = new Map<
  string,
  { ts: number; result: PriceFetchResult }
>();
const CACHE_TTL_MS = 60_000;

async function safeFetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function buildPriceMap(
  tokens: PriceTokenInput[],
  source: PriceSource,
): NormalizedPricesMap {
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
      fetchedAt: new Date().toISOString(),
    };
  }
  return map;
}

async function fetchFromCoinGecko(
  tokens: PriceTokenInput[],
): Promise<NormalizedPricesMap | null> {
  if (isCircuitOpen("coingecko")) return null;

  const ids = [...new Set(tokens.map((t) => t.coingeckoId))].join(",");
  const data = await safeFetchJson<
    {
      id: string;
      symbol: string;
      name: string;
      image: string;
      current_price: number;
      market_cap: number;
      price_change_percentage_24h_in_currency?: number;
      price_change_percentage_7d_in_currency?: number;
    }[]
  >(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h,7d`,
  );

  if (!data?.length) {
    recordSourceFailure("coingecko");
    return null;
  }

  const map = buildPriceMap(tokens, "coingecko");
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
      image: coin.image,
      source: "coingecko",
      fetchedAt: now,
    };
  }

  const hasPrices = Object.values(map).some((p) => p.price > 0);
  if (!hasPrices) {
    recordSourceFailure("coingecko");
    return null;
  }

  recordSourceSuccess("coingecko");
  return map;
}

async function fetchFromMobula(
  tokens: PriceTokenInput[],
): Promise<NormalizedPricesMap | null> {
  if (isCircuitOpen("mobula")) return null;

  const assets = [...new Set(tokens.map((t) => t.coingeckoId))].join(",");
  const data = await safeFetchJson<{
    data?: Array<{
      id?: number;
      name?: string;
      symbol?: string;
      price?: number;
      price_change_24h?: number;
      market_cap?: number;
      logo?: string;
    }>;
  }>(`https://api.mobula.io/api/1/market/multi-data?assets=${encodeURIComponent(assets)}`);

  const rows = data?.data;
  if (!rows?.length) {
    recordSourceFailure("mobula");
    return null;
  }

  const map = buildPriceMap(tokens, "mobula");
  const now = new Date().toISOString();
  const bySymbol = new Map(
    rows.map((row) => [String(row.symbol ?? "").toUpperCase(), row]),
  );

  for (const token of tokens) {
    const row =
      bySymbol.get(token.symbol.toUpperCase()) ??
      rows.find(
        (r) =>
          String(r.name ?? "").toLowerCase() === token.coingeckoId.toLowerCase(),
      );
    if (!row || !(row.price && row.price > 0)) continue;

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

  const hasPrices = Object.values(map).some((p) => p.price > 0);
  if (!hasPrices) {
    recordSourceFailure("mobula");
    return null;
  }

  recordSourceSuccess("mobula");
  return map;
}

async function fetchFromCoinMarketCap(
  tokens: PriceTokenInput[],
): Promise<NormalizedPricesMap | null> {
  if (isCircuitOpen("coinmarketcap")) return null;

  const apiKey =
    process.env.COINMARKETCAP_API_KEY ??
    process.env.VITE_COINMARKETCAP_API_KEY;
  if (!apiKey) return null;

  const symbols = [...new Set(tokens.map((t) => t.symbol.toUpperCase()))].join(
    ",",
  );
  const data = await safeFetchJson<{
    data?: Record<
      string,
      {
        id: number;
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
    >;
  }>(
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbols}`,
    { headers: { "X-CMC_PRO_API_KEY": apiKey } },
  );

  if (!data?.data) {
    recordSourceFailure("coinmarketcap");
    return null;
  }

  const map = buildPriceMap(tokens, "coinmarketcap");
  const now = new Date().toISOString();

  for (const token of tokens) {
    const entry = data.data[token.symbol.toUpperCase()];
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

  const hasPrices = Object.values(map).some((p) => p.price > 0);
  if (!hasPrices) {
    recordSourceFailure("coinmarketcap");
    return null;
  }

  recordSourceSuccess("coinmarketcap");
  return map;
}

function mergePartial(
  base: NormalizedPricesMap,
  patch: NormalizedPricesMap,
): NormalizedPricesMap {
  const next = { ...base };
  for (const [id, price] of Object.entries(patch)) {
    if (price.price > 0) next[id] = price;
  }
  return next;
}

export async function fetchPricesMultiSource(
  tokens: PriceTokenInput[],
): Promise<PriceFetchResult> {
  const cacheKey = tokens
    .map((t) => t.coingeckoId)
    .sort()
    .join(",");
  const cached = PRICE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.result, cached: true };
  }

  const sources: Array<() => Promise<NormalizedPricesMap | null>> = [
    () => fetchFromCoinGecko(tokens),
    () => fetchFromMobula(tokens),
    () => fetchFromCoinMarketCap(tokens),
  ];

  let merged = buildPriceMap(tokens, "coingecko");
  let primarySource: PriceSource = "coingecko";
  let anySuccess = false;

  for (const fetchSource of sources) {
    const result = await fetchSource();
    if (!result) continue;

    anySuccess = true;
    const firstWithPrice = Object.values(result).find((p) => p.price > 0);
    if (firstWithPrice) primarySource = firstWithPrice.source;

    merged = mergePartial(merged, result);

    const allFilled = tokens.every(
      (t) => (merged[t.coingeckoId]?.price ?? 0) > 0,
    );
    if (allFilled) break;
  }

  const fetchedAt = new Date().toISOString();
  const result: PriceFetchResult = {
    prices: merged,
    source: primarySource,
    degraded: !anySuccess || tokens.some((t) => (merged[t.coingeckoId]?.price ?? 0) <= 0),
    cached: false,
    fetchedAt,
  };

  if (anySuccess) {
    PRICE_CACHE.set(cacheKey, { ts: Date.now(), result });
  }

  return result;
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
