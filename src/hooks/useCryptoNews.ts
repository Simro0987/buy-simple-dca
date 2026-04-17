import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface NewsItem {
  id: number | string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  impact: 'high' | 'medium' | 'low';
  sentiment: 'bullish' | 'bearish' | 'neutral';
  tokens: string[];
}

async function fetchNews(currencies = 'BTC,ETH,SOL', lang = 'sk'): Promise<NewsItem[]> {
  const { data, error } = await supabase.functions.invoke('crypto-news', {
    body: { currencies, kind: 'news', lang },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Failed to fetch news');
  return data.data;
}

async function sendHighImpactToTelegram(news: NewsItem[]) {
  const chatId = localStorage.getItem('telegram_chat_id');
  if (!chatId) return;

  // Check if high impact news alerts are enabled
  try {
    const toggles = JSON.parse(localStorage.getItem('telegram_alert_toggles') || '{}');
    if (toggles.highImpactNews === false) return;
  } catch {}

  const highImpact = news.filter(n => n.impact === 'high');
  if (highImpact.length === 0) return;

  const sentKey = 'telegram_sent_news_ids';
  const sentIds: string[] = JSON.parse(localStorage.getItem(sentKey) || '[]');
  const newItems = highImpact.filter(n => !sentIds.includes(String(n.id)));
  if (newItems.length === 0) return;

  try {
    await supabase.functions.invoke('telegram-news-alert', {
      body: {
        chatId: chatId.trim(),
        news: newItems.map(n => ({
          title: n.title,
          summary: n.summary,
          url: n.url,
          sentiment: n.sentiment,
          tokens: n.tokens,
        })),
      },
    });

    const updated = [...sentIds, ...newItems.map(n => String(n.id))].slice(-100);
    localStorage.setItem(sentKey, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to send Telegram alert:', e);
  }
}

export function useCryptoNews(currencies?: string, lang = 'sk') {
  const sentForDataRef = useRef<number>(0);

  const query = useQuery({
    queryKey: ['crypto-news', currencies, lang],
    queryFn: () => fetchNews(currencies, lang),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data && query.dataUpdatedAt !== sentForDataRef.current) {
      sentForDataRef.current = query.dataUpdatedAt;
      sendHighImpactToTelegram(query.data);
    }
  }, [query.data, query.dataUpdatedAt]);

  return query;
}
