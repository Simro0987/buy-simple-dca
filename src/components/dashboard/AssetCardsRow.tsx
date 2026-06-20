import { TOKENS, formatUsd, formatPrice, formatQuantity, type PriceData } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';

interface Props {
  metrics: PortfolioMetrics;
  prices: PriceData | undefined;
}

export function AssetCardsRow({ metrics, prices }: Props) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {TOKENS.map(t => {
        const a = metrics.assets.find(x => x.symbol === t.symbol);
        if (!a) return null;
        const change24h = prices?.[t.coingeckoId]?.usd_24h_change ?? 0;
        const positive  = change24h >= 0;

        return (
          <div
            key={t.symbol}
            className="glass-card p-2.5"
            style={{ borderLeft: `2px solid ${t.color}40`, borderLeftColor: t.color }}
          >
            {/* Header: symbol + allocation */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-[11px] font-bold text-foreground tracking-wide">{t.symbol}</span>
              </div>
              <span
                className="text-[8px] font-semibold px-1 py-0.5 rounded tabular-nums"
                style={{ backgroundColor: `${t.color}18`, color: t.color }}
              >
                {Math.round(t.allocation * 100)}%
              </span>
            </div>

            {/* Price */}
            <p className="text-[13px] font-bold text-foreground tabular-nums leading-none mb-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatPrice(a.currentPrice)}
            </p>

            {/* 24h change tag */}
            <div className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold tabular-nums ${
              positive
                ? 'text-emerald-400' 
                : 'text-rose-400'
            }`}
              style={{ backgroundColor: positive ? 'rgba(52,211,153,0.10)' : 'rgba(248,113,113,0.10)' }}
            >
              {positive ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
            </div>

            {/* Holdings */}
            <div className="mt-2 pt-2 border-t border-white/5">
              <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-0.5">Holdings</p>
              <p className="text-[10px] font-semibold text-foreground tabular-nums leading-none">
                {formatQuantity(a.holdings, t.symbol)}
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{formatUsd(a.value)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
