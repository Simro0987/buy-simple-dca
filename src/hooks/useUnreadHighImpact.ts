import { useMemo } from 'react';
import { useCryptoNews } from '@/hooks/useCryptoNews';
import { Lang } from '@/lib/i18n';

const DISMISSED_KEY = 'dismissed-news-ids';

function getDismissedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useUnreadHighImpact(lang: Lang) {
  const { data: news } = useCryptoNews(undefined, lang);

  const count = useMemo(() => {
    if (!news) return 0;
    const dismissed = getDismissedIds();
    return news.filter(
      (n) => n.impact === 'high' && !dismissed.includes(String(n.id))
    ).length;
  }, [news]);

  return count;
}
