import { useInfiniteQuery } from '@tanstack/react-query';
import { dedupeNews, fetchOverviewNewsPage, type OverviewNewsItem } from '@/lib/overviewNews';

export function useOverviewNews(lang = 'sk') {
  return useInfiniteQuery({
    queryKey: ['overview-news', lang],
    queryFn: ({ pageParam }) => fetchOverviewNewsPage(lang, pageParam as number | undefined),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function flattenOverviewNewsPages(
  pages: Array<{ items: OverviewNewsItem[] }> | undefined,
): OverviewNewsItem[] {
  return dedupeNews((pages ?? []).flatMap(page => page.items));
}
