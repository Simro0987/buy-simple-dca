import { generateHeroImageUrl } from "@/lib/newsHeroImage";

export interface TokenImageRef {
  symbol: string;
  logoUrl?: string;
}

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
];

function isValidImageUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveUrl(base: string, candidate: string): string {
  try {
    return new URL(candidate, base).href;
  } catch {
    return candidate;
  }
}

export async function fetchOgImage(articleUrl: string): Promise<string | undefined> {
  if (!articleUrl) return undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(articleUrl, {
      headers: {
        "User-Agent": "EdgeTraderNewsBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    clearTimeout(timeout);

    if (!response.ok) return undefined;

    const html = await response.text();
    for (const pattern of OG_IMAGE_PATTERNS) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const resolved = resolveUrl(articleUrl, match[1].trim());
        if (isValidImageUrl(resolved)) return resolved;
      }
    }
  } catch {
    // Fall through to next strategy
  }

  return undefined;
}

export async function fetchUnsplashImage(query: string): Promise<string | undefined> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return undefined;

  try {
    const searchQuery = `${query} cryptocurrency abstract fintech`;
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=1&orientation=landscape&content_filter=high`;
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      next: { revalidate: 86400 },
    });

    if (!response.ok) return undefined;

    const data = (await response.json()) as {
      results?: Array<{ urls?: { regular?: string } }>;
    };
    const imageUrl = data.results?.[0]?.urls?.regular;
    return isValidImageUrl(imageUrl) ? imageUrl : undefined;
  } catch {
    return undefined;
  }
}

export function generateTokenFallbackImage(token: TokenImageRef): string {
  const symbol = token.symbol.toUpperCase().slice(0, 6);
  const accentHue = symbol.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
  const accent = `hsl(${accentHue}, 75%, 55%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="#050505"/>
  <rect width="640" height="360" fill="url(#glow)"/>
  <circle cx="320" cy="150" r="56" fill="${accent}" opacity="0.15"/>
  <text x="320" y="168" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="42" font-weight="800">${symbol.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  <text x="320" y="250" text-anchor="middle" fill="${accent}" font-family="system-ui,sans-serif" font-size="14" font-weight="600" letter-spacing="4">EDGE TRADER</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function resolveArticleImage(
  article: {
    url: string;
    title: string;
    imageUrl?: string;
  },
  primaryToken?: TokenImageRef,
): Promise<string> {
  if (isValidImageUrl(article.imageUrl)) {
    return article.imageUrl;
  }

  const ogImage = await fetchOgImage(article.url);
  if (isValidImageUrl(ogImage)) {
    return ogImage;
  }

  const unsplashImage = await fetchUnsplashImage(article.title);
  if (isValidImageUrl(unsplashImage)) {
    return unsplashImage;
  }

  const aiImage = await generateHeroImageUrl(article.title);
  if (isValidImageUrl(aiImage)) {
    return aiImage;
  }

  if (primaryToken) {
    return generateTokenFallbackImage(primaryToken);
  }

  return generateTokenFallbackImage({ symbol: "CRYPTO" });
}

export async function resolveArticleImagesBatch(
  articles: Array<{
    url: string;
    title: string;
    imageUrl?: string;
    primaryToken?: TokenImageRef;
  }>,
  concurrency = 4,
): Promise<string[]> {
  const results: string[] = new Array(articles.length).fill("");
  let index = 0;

  async function worker() {
    while (index < articles.length) {
      const current = index++;
      const article = articles[current];
      results[current] = await resolveArticleImage(article, article.primaryToken);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, articles.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
