import { useEffect, useState } from 'react';
import { sleep, translateToSlovak } from '@/lib/newsTranslate';

export interface ArticleTranslation {
  title?: string;
  detail?: string;
}

interface TranslatableArticle {
  id: string;
  title: string;
  detail?: string;
}

const BETWEEN_ARTICLES_MS = 180;
const BETWEEN_FIELDS_MS = 120;

async function translateArticleFields(
  article: TranslatableArticle,
): Promise<ArticleTranslation> {
  const title = await translateToSlovak(article.title);
  const result: ArticleTranslation = { title };

  const detail = String(article.detail ?? '').trim();
  if (detail) {
    await sleep(BETWEEN_FIELDS_MS);
    result.detail = await translateToSlovak(detail);
  }

  return result;
}

function buildTranslationQueue(
  priority: TranslatableArticle[],
  background: TranslatableArticle[],
): TranslatableArticle[] {
  const seen = new Set<string>();
  const queue: TranslatableArticle[] = [];

  for (const article of [...priority, ...background]) {
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    queue.push(article);
  }

  return queue;
}

/**
 * Lazily translates visible articles first (hero + list), then the rest in the background.
 * English renders immediately; Slovak replaces text as each translation resolves.
 */
export function useProgressiveNewsTranslation(
  enabled: boolean,
  priorityArticles: TranslatableArticle[],
  backgroundArticles: TranslatableArticle[],
) {
  const [translations, setTranslations] = useState<Record<string, ArticleTranslation>>({});

  const priorityKey = priorityArticles.map(a => `${a.id}:${a.title}`).join('|');
  const backgroundKey = backgroundArticles.map(a => `${a.id}:${a.title}`).join('|');

  useEffect(() => {
    if (!enabled) {
      setTranslations({});
      return;
    }

    let cancelled = false;

    const run = async () => {
      const queue = buildTranslationQueue(priorityArticles, backgroundArticles);

      for (const article of queue) {
        if (cancelled) break;

        try {
          const translated = await translateArticleFields(article);
          if (cancelled) break;

          setTranslations(prev => ({
            ...prev,
            [article.id]: translated,
          }));
        } catch {
          // Keep English — translateToSlovak already falls back per field
        }

        await sleep(BETWEEN_ARTICLES_MS);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, priorityKey, backgroundKey]);

  return translations;
}

export function applyArticleTranslation<T extends TranslatableArticle>(
  article: T,
  translations: Record<string, ArticleTranslation>,
): T {
  const translated = translations[article.id];
  if (!translated) return article;

  return {
    ...article,
    title: translated.title ?? article.title,
    detail: translated.detail ?? article.detail,
  };
}
