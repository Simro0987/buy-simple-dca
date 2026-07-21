import type { PortfolioTokenInput, RawNewsItem } from "@/lib/newsEngine";
import { getTokenBrandColor } from "@/lib/newsDefiBrands";
import { generateDefiPatternImage } from "@/lib/newsDefiImage";
import { getSourceFaviconUrl } from "@/lib/newsSources";
import { fetchMarketDataRace } from "@/lib/market-data/fetchMarketData";

interface CoinMarketData {
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h?: number;
  image?: string;
  id: string;
}

export async function fetchCoinGeckoMarketData(
  portfolioTokens: PortfolioTokenInput[],
): Promise<Map<string, CoinMarketData>> {
  const map = new Map<string, CoinMarketData>();
  if (portfolioTokens.length === 0) return map;

  const tokens = portfolioTokens.map((token) => ({
    symbol: token.symbol,
    coingeckoId: token.coingeckoId ?? token.symbol.toLowerCase(),
    name: token.name,
  }));

  try {
    const { prices, degraded } = await fetchMarketDataRace(tokens);
    if (degraded) return map;

    for (const token of portfolioTokens) {
      const entry =
        prices[token.coingeckoId ?? ""] ??
        Object.values(prices).find(
          (p) => p.symbol === token.symbol.toUpperCase(),
        );
      if (!entry || entry.price <= 0) continue;

      map.set(token.symbol.toUpperCase(), {
        symbol: entry.symbol,
        name: entry.name ?? token.name,
        current_price: entry.price,
        price_change_percentage_24h: entry.change24h,
        image: entry.image,
        id: entry.coingeckoId,
      });
    }
  } catch {
    return map;
  }

  return map;
}

function formatUsd(value: number): string {
  if (value >= 1000) {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

export function hasRecentNewsForToken(
  items: RawNewsItem[],
  symbol: string,
  hours = 24,
): boolean {
  const cutoff = Date.now() - hours * 3_600_000;
  const normalized = symbol.toUpperCase();

  return items.some(
    (item) =>
      item.tokens.some((token) => token.toUpperCase() === normalized) &&
      new Date(item.publishedAt).getTime() > cutoff &&
      !item.id.startsWith("market-status-"),
  );
}

export async function createMarketStatusItems(
  portfolioTokens: PortfolioTokenInput[],
  existingItems: RawNewsItem[],
  marketData: Map<string, CoinMarketData>,
): Promise<RawNewsItem[]> {
  const items: RawNewsItem[] = [];

  for (const token of portfolioTokens) {
    const symbol = token.symbol.toUpperCase();
    if (hasRecentNewsForToken(existingItems, symbol)) continue;

    const market = marketData.get(symbol);
    if (!market) continue;

    const change = market.price_change_percentage_24h ?? 0;
    const changeLabel =
      change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
    const logoUrl = token.logoUrl || market.image;
    const brandColor = getTokenBrandColor(symbol);

    const imageUrl = await generateDefiPatternImage(
      { symbol: token.symbol, logoUrl },
      brandColor,
    );

    items.push({
      id: `market-status-${symbol}`,
      title: `${symbol}: Market Status`,
      summary: `Aktuálna cena ${formatUsd(market.current_price)} · 24h zmena ${changeLabel}. Žiadne nové správy za posledných 24h.`,
      url: `https://www.coingecko.com/en/coins/${market.id}`,
      source: "CoinGecko Market",
      sourceDomain: "coingecko.com",
      sourceLogoUrl: getSourceFaviconUrl("coingecko.com"),
      publishedAt: new Date().toISOString(),
      imageUrl,
      tokens: [symbol],
    });
  }

  return items;
}
