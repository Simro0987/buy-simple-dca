import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NewsItem {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  impact: 'high' | 'medium' | 'low';
  sentiment: 'bullish' | 'bearish' | 'neutral';
  tokens: string[];
  votes: { positive: number; negative: number; important: number };
}

async function fetchNews(currencies = 'BTC,ETH,SOL,HYPE'): Promise<NewsItem[]> {
  const { data, error } = await supabase.functions.invoke('crypto-news', {
    body: { currencies, filter: 'news' },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Failed to fetch news');
  return data.data;
}

export function useCryptoNews(currencies?: string) {
  return useQuery({
    queryKey: ['crypto-news', currencies],
    queryFn: () => fetchNews(currencies),
    staleTime: 2 * 60 * 1000,     // 2 min
    refetchInterval: 5 * 60 * 1000, // 5 min
  });
}
