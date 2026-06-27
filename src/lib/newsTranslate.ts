const TRANSLATE_TIMEOUT_MS = 8_000;
const textCache = new Map<string, string>();

function parseGoogleTranslateResponse(json: unknown): string | null {
  if (!Array.isArray(json) || !Array.isArray(json[0])) return null;
  const parts = (json[0] as Array<[string] | string>)
    .map(segment => (Array.isArray(segment) ? segment[0] : ''))
    .join('');
  return parts.trim() || null;
}

/**
 * Free Google Translate endpoint (no API key). Falls back to original text on any error.
 */
export async function translateToSlovak(text: string): Promise<string> {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return text;

  const cached = textCache.get(trimmed);
  if (cached) return cached;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=sk&dt=t&q=${encodeURIComponent(trimmed)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return trimmed;

    const json = await res.json() as unknown;
    const translated = parseGoogleTranslateResponse(json);
    if (!translated) return trimmed;

    textCache.set(trimmed, translated);
    return translated;
  } catch {
    return trimmed;
  }
}

export function clearNewsTranslationCache(): void {
  textCache.clear();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
