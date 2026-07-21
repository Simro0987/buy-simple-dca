import type { RawNewsItem } from "@/lib/newsEngine";

const SOURCE_TRUST_SCORES: Record<string, number> = {
  "bloomberg.com": 100,
  bloomberg: 100,
  "reuters.com": 98,
  reuters: 98,
  "wsj.com": 95,
  "ft.com": 92,
  "coindesk.com": 88,
  coindesk: 88,
  "theblock.co": 84,
  theblock: 84,
  "decrypt.co": 78,
  decrypt: 78,
  "blockworks.co": 76,
  blockworks: 76,
  "cointelegraph.com": 72,
  cointelegraph: 72,
  "dlnews.com": 70,
  "coingecko.com": 68,
  coingecko: 68,
  "news.google.com": 35,
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "by",
  "and",
  "or",
  "as",
  "its",
  "it",
  "be",
  "has",
  "have",
  "with",
  "from",
  "that",
  "this",
  "will",
  "after",
  "over",
  "into",
]);

export function getSourceTrustScore(item: Pick<RawNewsItem, "source" | "sourceDomain">): number {
  const domain = item.sourceDomain?.toLowerCase() ?? "";
  const source = item.source?.toLowerCase() ?? "";

  if (SOURCE_TRUST_SCORES[domain]) return SOURCE_TRUST_SCORES[domain];
  if (SOURCE_TRUST_SCORES[source]) return SOURCE_TRUST_SCORES[source];

  const domainKey = Object.keys(SOURCE_TRUST_SCORES).find((key) =>
    domain.includes(key.replace(".com", "")),
  );
  if (domainKey) return SOURCE_TRUST_SCORES[domainKey];

  return 55;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .sort()
    .join(" ");
}

export function titleHash(title: string): string {
  return normalizeTitle(title);
}

function tokenize(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((word) => word.length > 2),
  );
}

export function titlesAreSimilar(a: string, b: string): boolean {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    if (shorter / longer >= 0.65) return true;
  }

  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  const intersection = [...wordsA].filter((word) => wordsB.has(word)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return union > 0 && intersection / union >= 0.72;
}

function pickBestFromGroup(group: RawNewsItem[]): RawNewsItem {
  return [...group].sort((a, b) => {
    const trustDiff = getSourceTrustScore(b) - getSourceTrustScore(a);
    if (trustDiff !== 0) return trustDiff;

    const imageScore = (item: RawNewsItem) =>
      item.imageUrl && !item.imageUrl.startsWith("data:") ? 1 : 0;
    const imageDiff = imageScore(b) - imageScore(a);
    if (imageDiff !== 0) return imageDiff;

    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  })[0];
}

export function deduplicateArticles(items: RawNewsItem[]): RawNewsItem[] {
  const groups: RawNewsItem[][] = [];

  for (const item of items) {
    const existingGroup = groups.find((group) =>
      titlesAreSimilar(item.title, group[0].title),
    );

    if (existingGroup) {
      existingGroup.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups.map(pickBestFromGroup);
}
