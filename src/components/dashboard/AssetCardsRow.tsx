import { TOKENS, formatUsd, formatPrice, formatQuantity, type PriceData } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';

interface Props {
  metrics: PortfolioMetrics;
  prices: PriceData | undefined;
}

export function AssetCardsRow({ metrics, prices }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 snap-x snap-mandatory">
      {TOKENS.map(t => {
        const a = metrics.assets.find(x => x.symbol === t.symbol);
        if (!a) return null;
        const change24h = prices?.[t.coingeckoId]?.usd_24h_change ?? 0;
        const positive = change24h >= 0;
        return (
          <div
            key={t.symbol}
            className="flex-shrink-0 w-[180px] snap-start glass-card p-3"
            style={{ borderTop: `2px solid ${t.color}` }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-foreground">{t.symbol}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(t.allocation * 100)}%</span>
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums">{formatPrice(a.currentPrice)}</p>
            <p className={`text-[11px] tabular-nums font-semibold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {positive ? '+' : ''}{change24h.toFixed(2)}% 24h
            </p>
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground">Holdings</p>
              <p className="text-xs font-semibold text-foreground tabular-nums">{formatQuantity(a.holdings, t.symbol)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatUsd(a.value)}</p>
              {a.source === 'manual' && (
                <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">manual</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
