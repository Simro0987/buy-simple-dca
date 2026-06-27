/** Pollinations.ai context-aware fallback when article thumbnails are missing or fail. */
export function buildPollinationsImageUrl(
  title: string,
  width = 400,
  height = 250,
): string {
  const prompt = `${title} cryptocurrency professional news background dark`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`;
}

/** Google favicon service — extracts domain from article URL. */
export function getSourceFaviconUrl(articleUrl: string): string | null {
  try {
    const domain = new URL(articleUrl).hostname;
    if (!domain) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  } catch {
    return null;
  }
}
