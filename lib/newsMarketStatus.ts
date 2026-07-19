import type { PortfolioTokenInput, RawNewsItem } from "@/lib/newsEngine";
import { getTokenBrandColor } from "@/lib/newsDefiBrands";
import { generateDefiPatternImage } from "@/lib/newsDefiImage";
import { getSourceFaviconUrl } from "@/lib/newsSources";

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

  const ids = portfolioTokens
    .map((token) => token.coingeckoId)
    .filter(Boolean) as string[];

  const symbols = portfolioTokens.map((t) => t.symbol.toLowerCase()).join(",");
  const query = ids.length
    ? `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(",")}&price_change_percentage=24h`
    : `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${symbols}&price_change_percentage=24h`;

  try {
    const response = await fetch(query, { next: { revalidate: 300 } });
    if (!response.ok) return map;

    const data = (await response.json()) as CoinMarketData[];
    for (const coin of data) {
      map.set(coin.symbol.toUpperCase(), coin);
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
