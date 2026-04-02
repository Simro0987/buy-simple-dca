import { Lang, t } from '@/lib/i18n';

interface Props {
  value: number;
  label: string;
  lang: Lang;
}

export function AltSeasonWidget({ value, label, lang }: Props) {
  const displayLabel = label === 'Alt Season'
    ? t('altSeason', lang)
    : label === 'BTC Season'
      ? t('btcSeason', lang)
      : t('neutral', lang);

  return (
    <div className="glass-card p-4 space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{t('altSeasonIndex', lang)}</h3>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        <span className={`text-sm font-medium px-2 py-1 rounded-md ${
          value >= 75 ? 'bg-gain/20 text-gain' : value <= 25 ? 'bg-warning/20 text-warning' : 'bg-secondary text-muted-foreground'
        }`}>
          {displayLabel}
        </span>
      </div>
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: `${value}%`,
            background: value >= 75
              ? 'hsl(var(--gain))'
              : value <= 25
                ? 'hsl(var(--warning))'
                : 'hsl(var(--muted-foreground))',
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{t('btcSeason', lang)}</span>
        <span>{t('altSeason', lang)}</span>
      </div>
    </div>
  );
}
