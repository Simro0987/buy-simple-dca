import { TOKENS, formatUsd } from '@/lib/crypto';
import { usePrices } from '@/hooks/usePrices';
import { Lang, t } from '@/lib/i18n';

interface Props { lang: Lang; }

export function PortfolioPage({ lang }: Props) {
  const { data: prices } = usePrices();

  // Simple portfolio display based on allocation targets
  // In a real app, this would read actual holdings
  const totalInvested = Number(localStorage.getItem('total-invested')) || 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">{t('portfolio', lang)}</h1>

      {/* Pie chart */}
      <div className="glass-card p-6 flex flex-col items-center">
        <div className="relative w-48 h-48 mb-4">
          <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90">
            {(() => {
              let offset = 0;
              return TOKENS.map(token => {
                const pct = token.allocation * 100;
                const el = (
                  <circle
                    key={token.id}
                    cx="21" cy="21" r="15.5"
                    fill="none"
                    stroke={token.color}
                    strokeWidth="5"
                    strokeDasharray={`${pct} ${100 - pct}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += pct;
                return el;
              });
            })()}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xs text-muted-foreground">{t('totalValue', lang)}</p>
            <p className="text-lg font-bold text-foreground">{formatUsd(totalInvested)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
          {TOKENS.map(token => (
            <div key={token.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: token.color }} />
              <span className="text-sm text-foreground">{token.symbol}</span>
              <span className="text-sm text-muted-foreground ml-auto">{(token.allocation * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Token details */}
      {TOKENS.map(token => {
        const price = prices?.[token.coingeckoId]?.usd ?? 0;
        return (
          <div key={token.id} className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: token.color + '20', color: token.color }}
                >
                  {token.symbol.slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{token.symbol}</p>
                  <p className="text-xs text-muted-foreground">{t('target', lang)}: {(token.allocation * 100)}%</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{formatUsd(price)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
