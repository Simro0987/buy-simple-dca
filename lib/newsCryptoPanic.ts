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

export async function fetchCryptoPanicForToken(
  token: PortfolioTokenInput,
): Promise<RawNewsItem[]> {
  const apiKey = process.env.CRYPTOPANIC_API_KEY;
  if (!apiKey) return [];

  try {
    const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${apiKey}&currencies=${token.symbol}&kind=news&public=true`;
    const response = await fetch(url, {
      headers: { "User-Agent": "EdgeTraderNewsBot/1.0" },
      next: { revalidate: 900 },
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as { results?: CryptoPanicPost[] };
    const symbol = token.symbol.toUpperCase();

    return (payload.results ?? []).slice(0, 8).map((post, index) => {
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
        [symbol];

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
    });
  } catch {
    return [];
  }
}

export async function fetchCryptoPanicForPortfolio(
  portfolioTokens: PortfolioTokenInput[],
): Promise<RawNewsItem[]> {
  const tokens = portfolioTokens.length > 0 ? portfolioTokens : [];
  if (tokens.length === 0) return [];

  const results = await Promise.all(
    tokens.map((token) => fetchCryptoPanicForToken(token)),
  );

  return results.flat();
}
