import type { NewsArticle } from "@/lib/newsEngine";

export const FLASH_RELEVANCE_MIN = 90;
export const FLASH_MAX_AGE_MINUTES = 60;

export function normalizeRelevanceScore(score: number): number {
  return Math.min(100, Math.round(score / 3.5));
}

export function isWithinFlashWindow(publishedAt: string): boolean {
  const ageMinutes =
    (Date.now() - new Date(publishedAt).getTime()) / 60_000;
  return ageMinutes >= 0 && ageMinutes < FLASH_MAX_AGE_MINUTES;
}

export function qualifiesForFlash(
  article: Pick<NewsArticle, "relevanceScore" | "publishedAt">,
): boolean {
  return (
    normalizeRelevanceScore(article.relevanceScore ?? 0) > FLASH_RELEVANCE_MIN &&
    isWithinFlashWindow(article.publishedAt)
  );
}

export function selectFlashArticleId(
  articles: NewsArticle[],
): string | null {
  const candidate = [...articles]
    .filter(qualifiesForFlash)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)[0];

  return candidate?.id ?? null;
}

export function isFlashAlertArticle(
  article: Pick<NewsArticle, "id">,
  flashArticleId: string | null = null,
): boolean {
  return flashArticleId !== null && article.id === flashArticleId;
}
