import { TOKENS, type PriceData } from '@/lib/crypto';
import { Lang, t } from '@/lib/i18n';

interface Props {
  prices: PriceData | undefined;
  lang: Lang;
}

export function PortfolioHeatMap({ prices, lang }: Props) {
  return (
    <div className="glass-card p-4 space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{t('heatMap', lang)}</h3>
      <div className="grid grid-cols-2 gap-2">
        {TOKENS.map(token => {
          const change = prices?.[token.coingeckoId]?.usd_24h_change ?? 0;
          const intensity = Math.min(Math.abs(change) / 10, 1);
          const isPositive = change >= 0;

          return (
            <div
              key={token.id}
              className="rounded-lg p-3 text-center transition-colors"
              style={{
                backgroundColor: isPositive
                  ? `hsla(142, 71%, 45%, ${0.1 + intensity * 0.3})`
                  : `hsla(0, 84%, 60%, ${0.1 + intensity * 0.3})`,
              }}
            >
              <p className="text-sm font-bold text-foreground">{token.symbol}</p>
              <p className="text-xs text-muted-foreground">{(token.allocation * 100).toFixed(0)}%</p>
              <p className={`text-xs font-bold ${isPositive ? 'text-gain' : 'text-loss'}`}>
                {isPositive ? '+' : ''}{change.toFixed(2)}%
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
