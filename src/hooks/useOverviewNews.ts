import { useQuery } from '@tanstack/react-query';
import { fetchAggregatedNews, type OverviewNewsItem } from '@/lib/overviewNews';

export function useOverviewNews(lang = 'sk') {
  return useQuery({
    queryKey: ['overview-news-aggregated', lang],
    queryFn: () => fetchAggregatedNews(lang),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function getOverviewNewsItems(
  data: { items: OverviewNewsItem[] } | undefined,
): OverviewNewsItem[] {
  return data?.items ?? [];
}
