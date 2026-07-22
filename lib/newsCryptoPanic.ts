import type { PortfolioTokenInput, RawNewsItem } from "@/lib/newsEngine";
import { getSourceFaviconUrl } from "@/lib/newsSources";

interface CryptoPanicPost {
  id?: string | number;
  title?: string;
  url?: string;
  original_url?: string;
  published_at?: string;
  source?: { title?: string; domain?: string };
  currencies?: Array<{ code: string }>;
  instruments?: Array<{ code: string }>;
}

function mapCryptoPanicPost(
  post: CryptoPanicPost,
  symbol: string,
  index: number,
): RawNewsItem {
  const sourceName = post.source?.title || post.source?.domain || "CryptoPanic";
  const itemUrl = post.original_url || post.url || "";
  let domain = "cryptopanic.com";

  if (itemUrl) {
    try {
      domain = new URL(itemUrl).hostname.replace("www.", "");
    } catch {
      // Keep default domain
    }
  }

  const detected =
    post.currencies?.map((c) => c.code.toUpperCase()) ??
    post.instruments?.map((c) => c.code.toUpperCase()) ??
    [];

  return {
    id: `cryptopanic-${symbol}-${post.id ?? index}`,
    title: post.title ?? `${symbol} news`,
    summary: "",
    url: itemUrl,
    source: `CryptoPanic · ${sourceName}`,
    sourceDomain: domain,
    sourceLogoUrl: getSourceFaviconUrl("cryptopanic.com"),
    publishedAt: post.published_at
      ? new Date(post.published_at).toISOString()
      : new Date().toISOString(),
    tokens: [...new Set([symbol, ...detected])],
  };
}

async function fetchCryptoPanicEndpoint(
  apiKey: string,
  symbol: string,
  version: "v1" | "v2",
): Promise<RawNewsItem[]> {
  const base =
    version === "v2"
      ? "https://cryptopanic.com/api/developer/v2/posts/"
      : "https://cryptopanic.com/api/v1/posts/";

  const url = `${base}?auth_token=${apiKey}&currencies=${symbol}&kind=news&public=true`;

  const response = await fetch(url, {
    headers: { "User-Agent": "EdgeTraderNewsBot/1.0" },
    next: { revalidate: 900 },
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as { results?: CryptoPanicPost[] };

  return (payload.results ?? [])
    .slice(0, 8)
    .map((post, index) => mapCryptoPanicPost(post, symbol, index));
}

export async function fetchCryptoPanicForToken(
  token: PortfolioTokenInput,
): Promise<RawNewsItem[]> {
  const apiKey = process.env.CRYPTOPANIC_API_KEY;
  if (!apiKey) return [];

  const symbol = token.symbol.toUpperCase();

  try {
    const v2Items = await fetchCryptoPanicEndpoint(apiKey, symbol, "v2");
    if (v2Items.length > 0) return v2Items;

    return await fetchCryptoPanicEndpoint(apiKey, symbol, "v1");
  } catch {
    return [];
  }
}

export async function fetchCryptoPanicForPortfolio(
  portfolioTokens: PortfolioTokenInput[],
): Promise<RawNewsItem[]> {
  if (portfolioTokens.length === 0) return [];

  const results: RawNewsItem[] = [];
  const batchSize = 4;

  for (let i = 0; i < portfolioTokens.length; i += batchSize) {
    const batch = portfolioTokens.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((token) => fetchCryptoPanicForToken(token)),
    );
    results.push(...batchResults.flat());
  }

  return results;
}
