import { TrendingUp, TrendingDown } from 'lucide-react';
import { Lang, t } from '@/lib/i18n';

interface Props {
  fearGreedValue: number;
  lang: Lang;
}

export function MarketBanner({ fearGreedValue, lang }: Props) {
  const isBull = fearGreedValue >= 50;

  return (
    <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between ${
      isBull ? 'bg-gain/10 border border-gain/20' : 'bg-loss/10 border border-loss/20'
    }`}>
      <div className="flex items-center gap-2">
        {isBull ? (
          <TrendingUp className="w-5 h-5 text-gain" />
        ) : (
          <TrendingDown className="w-5 h-5 text-loss" />
        )}
        <span className={`text-sm font-bold ${isBull ? 'text-gain' : 'text-loss'}`}>
          {isBull ? t('bullMarket', lang) : t('bearMarket', lang)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        F&G: {fearGreedValue}
      </span>
    </div>
  );
}
