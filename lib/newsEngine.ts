import { NEWS_SOURCES, getSourceFaviconUrl } from "@/lib/newsSources";

export type NewsImpact = "high" | "medium" | "low";
export type NewsSentiment = "bullish" | "bearish" | "neutral";

export interface RawNewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  sourceDomain: string;
  sourceLogoUrl: string;
  publishedAt: string;
  imageUrl?: string;
  tokens: string[];
}

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  sourceDomain: string;
  sourceLogoUrl: string;
  publishedAt: string;
  imageUrl?: string;
  tokens: string[];
  impact: NewsImpact;
  sentiment: NewsSentiment;
  isFlash: boolean;
}

function decodeEntities(input: string): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/&#(\d+);/g, (_, n) => {
    try {
      return String.fromCodePoint(parseInt(n, 10));
    } catch {
      return "";
    }
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    try {
      return String.fromCodePoint(parseInt(h, 16));
    } catch {
      return "";
    }
  });
  s = s.replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  s = s.replace(/<[^>]*>/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function extractImageFromBlock(block: string): string | undefined {
  const patterns = [
    /<media:content[^>]*url=["']([^"']+)["']/i,
    /<media:thumbnail[^>]*url=["']([^"']+)["']/i,
    /<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image/i,
    /<enclosure[^>]*type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function detectTokens(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  if (/\bBTC\b/.test(upper) || /\bBITCOIN\b/.test(upper)) found.add("BTC");
  if (/\bETH\b/.test(upper) || /\bETHEREUM\b/.test(upper)) found.add("ETH");
  if (/\bSOL\b/.test(upper) || /\bSOLANA\b/.test(upper)) found.add("SOL");
  if (/\bDEFI\b/.test(upper)) found.add("DeFi");
  return [...found];
}

function classifyArticle(title: string): {
  impact: NewsImpact;
  sentiment: NewsSentiment;
  isFlash: boolean;
} {
  const lower = title.toLowerCase();
  const flashKeywords = [
    "hack",
    "exploit",
    "breaking",
    "sec approval",
    "fed rate",
    "liquidation",
    "bankrupt",
    "emergency",
  ];
  const highKeywords = [
    "etf",
    "regulation",
    "approval",
    "ban",
    "lawsuit",
    "halving",
  ];
  const bullishKeywords = ["surge", "rally", "bullish", "gain", "approval", "ath"];
  const bearishKeywords = ["crash", "drop", "bearish", "hack", "ban", "collapse"];

  const isFlash = flashKeywords.some((k) => lower.includes(k));
  const impact: NewsImpact = isFlash || highKeywords.some((k) => lower.includes(k))
    ? "high"
    : "medium";

  const bull = bullishKeywords.filter((k) => lower.includes(k)).length;
  const bear = bearishKeywords.filter((k) => lower.includes(k)).length;
  const sentiment: NewsSentiment =
    bull > bear ? "bullish" : bear > bull ? "bearish" : "neutral";

  return { impact, sentiment, isFlash };
}

function parseFeedItems(
  xml: string,
  sourceName: string,
  sourceDomain: string,
  maxItems: number,
): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const blockRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = blockRegex.exec(xml)) !== null && count < maxItems) {
    const block = match[2];
    const rawTitle =
      block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ??
      "";
    const link =
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
      block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1] ??
      block.match(/<id>([\s\S]*?)<\/id>/i)?.[1] ??
      "";
    const pubDate =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      block.match(/<published>([\s\S]*?)<\/published>/i)?.[1] ??
      block.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] ??
      "";
    const desc =
      block.match(
        /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i,
      )?.[1] ??
      block.match(
        /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i,
      )?.[1] ??
      block.match(
        /<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i,
      )?.[1] ??
      "";

    const title = decodeEntities(rawTitle.replace(/<[^>]*>/g, "").trim());
    if (!title) continue;

    const imageUrl = extractImageFromBlock(block) ?? extractImageFromBlock(desc);
    const summary = decodeEntities(desc).slice(0, 280);
    const publishedAt = pubDate
      ? new Date(pubDate).toISOString()
      : new Date().toISOString();

    items.push({
      id: `${sourceName.toLowerCase().replace(/\s/g, "")}-${count}-${Date.now()}`,
      title,
      summary,
      url: link.trim(),
      source: sourceName,
      sourceDomain,
      sourceLogoUrl: getSourceFaviconUrl(sourceDomain),
      publishedAt,
      imageUrl,
      tokens: detectTokens(`${title} ${summary}`),
    });
    count++;
  }

  return items;
}

async function fetchFeed(
  feedUrl: string,
  sourceName: string,
  sourceDomain: string,
  maxItems: number,
): Promise<RawNewsItem[]> {
  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "EdgeTraderNewsBot/1.0" },
      next: { revalidate: 900 },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseFeedItems(xml, sourceName, sourceDomain, maxItems);
  } catch {
    return [];
  }
}

async function translateText(text: string, targetLang = "sk"): Promise<string> {
  if (!text || targetLang === "en") return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) return text;
    const data = (await response.json()) as [[[string]]];
    return data?.[0]?.map((part) => part[0]).join("") || text;
  } catch {
    return text;
  }
}

async function translateBatch(texts: string[]): Promise<string[]> {
  return Promise.all(texts.map((text) => translateText(text)));
}

export async function fetchSupabaseNews(): Promise<RawNewsItem[]> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/crypto-news`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currencies: "BTC,ETH,SOL",
        kind: "news",
        lang: "sk",
      }),
      next: { revalidate: 900 },
    });

    if (!response.ok) return [];
    const payload = (await response.json()) as {
      success?: boolean;
      data?: Array<{
        id: string | number;
        title: string;
        summary?: string;
        url: string;
        source: string;
        publishedAt: string;
        tokens?: string[];
        flash?: boolean;
      }>;
    };

    if (!payload.success || !payload.data) return [];

    return payload.data.map((item) => {
      const domain = item.source.toLowerCase().includes("coindesk")
        ? "coindesk.com"
        : item.source.toLowerCase().includes("cointelegraph")
          ? "cointelegraph.com"
          : item.source.toLowerCase().replace(/\s/g, "") + ".com";

      return {
        id: String(item.id),
        title: item.title,
        summary: item.summary ?? "",
        url: item.url,
        source: item.source,
        sourceDomain: domain,
        sourceLogoUrl: getSourceFaviconUrl(domain),
        publishedAt: item.publishedAt,
        tokens: item.tokens ?? detectTokens(item.title),
      };
    });
  } catch {
    return [];
  }
}

export async function aggregateNews(): Promise<NewsArticle[]> {
  const feedResults = await Promise.all(
    NEWS_SOURCES.map((source) =>
      fetchFeed(source.feedUrl, source.name, source.domain, source.maxItems),
    ),
  );

  const supabaseItems = await fetchSupabaseNews();
  const allItems = [...feedResults.flat(), ...supabaseItems];

  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  const top = unique.slice(0, 30);
  const titles = await translateBatch(top.map((item) => item.title));
  const summaries = await translateBatch(
    top.map((item) => item.summary || item.title),
  );

  const articles: NewsArticle[] = top.map((item, index) => {
    const title = titles[index] || item.title;
    const summary = summaries[index] || item.summary;
    const classification = classifyArticle(title);

    return {
      id: item.id,
      title,
      summary,
      url: item.url,
      source: item.source,
      sourceDomain: item.sourceDomain,
      sourceLogoUrl: item.sourceLogoUrl,
      publishedAt: item.publishedAt,
      imageUrl: item.imageUrl,
      tokens: item.tokens,
      ...classification,
    };
  });

  articles.sort((a, b) => {
    if (a.isFlash !== b.isFlash) return a.isFlash ? -1 : 1;
    const impactOrder = { high: 0, medium: 1, low: 2 };
    const impactDiff = impactOrder[a.impact] - impactOrder[b.impact];
    if (impactDiff !== 0) return impactDiff;
    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });

  return articles;
}
