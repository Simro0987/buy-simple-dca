export interface TokenImageRef {
  symbol: string;
  logoUrl?: string;
}

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
];

const SKIP_IMAGE_PATTERN =
  /logo|icon|avatar|sprite|emoji|badge|pixel|tracking|1x1|spacer|placeholder|advert|banner-ad|svg/i;

interface ParsedImage {
  url: string;
  width: number;
  height: number;
  area: number;
}

function isValidImageUrl(url: string | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("data:")) return false;
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

function parseDimension(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSrcset(srcset: string): { url: string; width: number }[] {
  return srcset
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const [url, descriptor] = part.split(/\s+/);
      const width = descriptor?.endsWith("w")
        ? parseDimension(descriptor)
        : 0;
      return { url, width };
    })
    .filter((entry) => Boolean(entry.url));
}

function scoreImageCandidate(
  url: string,
  width: number,
  height: number,
): ParsedImage | null {
  if (!isValidImageUrl(url)) return null;
  if (SKIP_IMAGE_PATTERN.test(url)) return null;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return null;

  const area =
    width > 0 && height > 0
      ? width * height
      : width > 0
        ? width * width
        : 1200;
  return { url, width, height, area };
}

export function extractLargestImagesFromHtml(
  html: string,
  baseUrl: string,
): ParsedImage[] {
  const candidates: ParsedImage[] = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    const width = parseDimension(tag.match(/\bwidth=["']?(\d+)/i)?.[1]);
    const height = parseDimension(tag.match(/\bheight=["']?(\d+)/i)?.[1]);

    if (srcset) {
      const entries = parseSrcset(srcset).sort((a, b) => b.width - a.width);
      const best = entries[0];
      if (best) {
        const candidate = scoreImageCandidate(
          resolveUrl(baseUrl, best.url),
          best.width || width,
          height,
        );
        if (candidate) candidates.push(candidate);
      }
    }

    if (src) {
      const candidate = scoreImageCandidate(
        resolveUrl(baseUrl, src),
        width,
        height,
      );
      if (candidate) candidates.push(candidate);
    }
  }

  for (const pattern of OG_IMAGE_PATTERNS) {
    const metaMatch = html.match(pattern);
    if (metaMatch?.[1]) {
      const candidate = scoreImageCandidate(
        resolveUrl(baseUrl, metaMatch[1].trim()),
        1200,
        630,
      );
      if (candidate) candidates.push(candidate);
    }
  }

  const unique = new Map<string, ParsedImage>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.url);
    if (!existing || candidate.area > existing.area) {
      unique.set(candidate.url, candidate);
    }
  }

  return [...unique.values()].sort((a, b) => b.area - a.area);
}

async function fetchArticleHtml(articleUrl: string): Promise<string | undefined> {
  if (!articleUrl) return undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

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
    return response.text();
  } catch {
    return undefined;
  }
}

export async function fetchLargestArticleImage(
  articleUrl: string,
): Promise<string | undefined> {
  const html = await fetchArticleHtml(articleUrl);
  if (!html) return undefined;

  const images = extractLargestImagesFromHtml(html, articleUrl);
  const best = images.find((image) => image.area >= 40_000) ?? images[0];
  return best?.url;
}

export async function fetchBingNewsImage(
  query: string,
): Promise<string | undefined> {
  const apiKey = process.env.BING_NEWS_API_KEY;
  if (!apiKey) return undefined;

  try {
    const url = `https://api.bing.microsoft.com/v7.0/news/search?q=${encodeURIComponent(query)}&count=5&mkt=en-US&freshness=Week`;
    const response = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      next: { revalidate: 3600 },
    });

    if (!response.ok) return undefined;

    const data = (await response.json()) as {
      value?: Array<{
        image?: { thumbnail?: { contentUrl?: string } };
      }>;
    };

    for (const item of data.value ?? []) {
      const imageUrl = item.image?.thumbnail?.contentUrl;
      if (isValidImageUrl(imageUrl)) return imageUrl;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function fetchGoogleNewsImage(
  query: string,
): Promise<string | undefined> {
  try {
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "EdgeTraderNewsBot/1.0" },
      next: { revalidate: 1800 },
    });

    if (!response.ok) return undefined;

    const xml = await response.text();
    const patterns = [
      /<media:content[^>]*url=["']([^"']+)["']/i,
      /<media:thumbnail[^>]*url=["']([^"']+)["']/i,
      /<enclosure[^>]*url=["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = xml.match(pattern);
      if (match?.[1] && isValidImageUrl(match[1])) {
        return match[1];
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function fetchNewsSearchImage(
  title: string,
  tokens: string[] = [],
): Promise<string | undefined> {
  const tokenPart = tokens.slice(0, 2).join(" ");
  const query = `${title} ${tokenPart} crypto`.trim();

  const bingImage = await fetchBingNewsImage(query);
  if (isValidImageUrl(bingImage)) return bingImage;

  const googleImage = await fetchGoogleNewsImage(query);
  if (isValidImageUrl(googleImage)) return googleImage;

  return undefined;
}

export function generateTokenFallbackImage(token: TokenImageRef): string {
  const symbol = token.symbol.toUpperCase().slice(0, 6);
  const accentHue =
    symbol.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
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
    tokens?: string[];
  },
  primaryToken?: TokenImageRef,
): Promise<string> {
  if (isValidImageUrl(article.imageUrl)) {
    return article.imageUrl;
  }

  const largestImage = await fetchLargestArticleImage(article.url);
  if (isValidImageUrl(largestImage)) {
    return largestImage;
  }

  const newsSearchImage = await fetchNewsSearchImage(
    article.title,
    article.tokens ?? [],
  );
  if (isValidImageUrl(newsSearchImage)) {
    return newsSearchImage;
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
    tokens?: string[];
    primaryToken?: TokenImageRef;
  }>,
  concurrency = 3,
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
