import { useQuery } from '@tanstack/react-query';
import { fetchOverviewNews } from '@/lib/overviewNews';

export function useOverviewNews(lang = 'sk') {
  return useQuery({
    queryKey: ['overview-news', lang],
    queryFn: () => fetchOverviewNews(lang),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
