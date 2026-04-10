import { useEffect, useState, useCallback, useRef } from 'react';
import { useCryptoNews, NewsItem } from '@/hooks/useCryptoNews';
import { Lang, t } from '@/lib/i18n';
import { AlertTriangle, X, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  lang: Lang;
}

const DISMISSED_KEY = 'dismissed-news-ids';

function getDismissedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
}

function dismissId(id: string) {
  const ids = getDismissedIds();
  const updated = [...ids, id].slice(-50);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(updated));
}

const sentimentConfig = {
  bullish: { icon: TrendingUp, class: 'text-gain' },
  bearish: { icon: TrendingDown, class: 'text-loss' },
  neutral: { icon: Minus, class: 'text-muted-foreground' },
};

export function HighImpactNewsBanner({ lang }: Props) {
  const { data: news } = useCryptoNews(undefined, lang);
  const [visible, setVisible] = useState<NewsItem | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(getDismissedIds);
  const [exiting, setExiting] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!news) return;
    const highImpact = news.filter(
      (n) => n.impact === 'high' && !dismissed.includes(String(n.id))
    );
    if (highImpact.length > 0) {
      const newItem = highImpact[0];
      const isNew = !visible || String(visible.id) !== String(newItem.id);
      setVisible(newItem);
      setExiting(false);
      if (isNew) {
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      }
    } else {
      setVisible(null);
    }
  }, [news, dismissed]);

  const handleDismiss = useCallback(() => {
    if (!visible || exiting) return;
    setExiting(true);
    setTimeout(() => {
      const id = String(visible.id);
      dismissId(id);
      setDismissed((prev) => [...prev, id]);
      setExiting(false);
    }, 300);
  }, [visible, exiting]);

  const handleOpen = useCallback(() => {
    if (!visible?.url) return;
    window.open(visible.url, '_blank', 'noopener');
    handleDismiss();
  }, [visible, handleDismiss]);

  if (!visible) return null;

  const SentimentIcon = sentimentConfig[visible.sentiment]?.icon || Minus;
  const sentimentClass = sentimentConfig[visible.sentiment]?.class || 'text-muted-foreground';

  return (
    <div className="relative rounded-lg border border-warning/30 bg-warning/10 p-3 animate-in slide-in-from-top-2 duration-300">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-warning/20 transition-colors"
        aria-label="Zavrieť"
      >
        <X className="w-4 h-4 text-warning" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="mt-0.5 flex-shrink-0 rounded-full bg-warning/20 p-1.5">
          <AlertTriangle className="w-4 h-4 text-warning" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
              {lang === 'sk' ? 'Dôležitá správa' : 'High Impact'}
            </span>
            <SentimentIcon className={`w-3 h-3 ${sentimentClass}`} />
            {visible.tokens.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {visible.tokens.join(', ')}
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
            {visible.title}
          </p>

          {visible.summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {visible.summary}
            </p>
          )}

          <button
            onClick={handleOpen}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-warning hover:text-warning/80 transition-colors"
          >
            {lang === 'sk' ? 'Čítať viac' : 'Read more'}
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
