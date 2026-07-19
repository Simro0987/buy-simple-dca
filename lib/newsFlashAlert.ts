import type { NewsArticle } from "@/lib/newsEngine";

export const FLASH_RELEVANCE_THRESHOLD = 260;
export const FLASH_HIGH_IMPACT_THRESHOLD = 220;

export function isFlashAlertArticle(
  article: Pick<NewsArticle, "isFlash" | "impact" | "relevanceScore">,
): boolean {
  if (article.isFlash) return true;
  if (
    article.impact === "high" &&
    (article.relevanceScore ?? 0) >= FLASH_HIGH_IMPACT_THRESHOLD
  ) {
    return true;
  }
  if ((article.relevanceScore ?? 0) >= FLASH_RELEVANCE_THRESHOLD) {
    return true;
  }
  return false;
}
