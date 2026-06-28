import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TOKENS, formatUsd, PriceData } from '@/lib/crypto';
import { getAvgCostBasis } from '@/lib/profitTaking';
import { useChainFilter, passesChainFilter } from '@/hooks/useChainFilter';
import { loadHoldingsRecord } from '@/lib/portfolioRealHoldings';

interface Props {
  prices: PriceData | undefined;
}

interface ChainPnL {
  symbol: string;
  color: string;
  qty: number;
  price: number;
  avgCost: number;
  unrealizedUsd: number;
  unrealizedPct: number;
  realizedUsd: number;
  totalUsd: number;
  nativeProfit: number; // in token units
}

const CHAIN_COLORS: Record<string, string> = {
  BTC: '#f7931a',
  ETH: '#627eea',
  SOL: '#14f195',
  HYPE: '#a855f7',
};

function loadHoldings(): Record<string, number> {
  return loadHoldingsRecord() as Record<string, number>;
}

function computeRealized(tokenId: string): number {
  // Sum realized USD from execution history (DCA purchases ledger doesn't track sells,
  // so we look at portfolio history snapshots where sells were marked)
  try {
    const raw = localStorage.getItem(`profit-realized-${tokenId}`);
    if (!raw) return 0;
    const arr = JSON.parse(raw) as Array<{ usd: number }>;
    return arr.reduce((s, r) => s + (r.usd ?? 0), 0);
  } catch { return 0; }
}

export function PerChainPnLSummary({ prices }: Props) {
  const { chain } = useChainFilter();

  const data = useMemo<ChainPnL[]>(() => {
    if (!prices) return [];
    const holdings = loadHoldings();
    const avgCostMap = getAvgCostBasis();
    return TOKENS
      .filter(t => passesChainFilter(t.symbol, chain))
      .map(t => {
        const qty = holdings[t.id] ?? 0;
        const price = prices[t.coingeckoId]?.usd ?? 0;
        const avgCost = avgCostMap[t.id] ?? 0;
        const positionUsd = qty * price;
        const costUsd = qty * avgCost;
        const unrealizedUsd = positionUsd - costUsd;
        const unrealizedPct = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0;
        const realizedUsd = computeRealized(t.id);
        const nativeProfit = avgCost > 0 && price > 0 ? qty * (price - avgCost) / price : 0;
        return {
          symbol: t.symbol,
          color: CHAIN_COLORS[t.symbol] ?? t.color,
          qty,
          price,
          avgCost,
          unrealizedUsd,
          unrealizedPct,
          realizedUsd,
          totalUsd: positionUsd,
          nativeProfit,
        };
      })
      .filter(d => d.qty > 0 || d.realizedUsd !== 0);
  }, [prices, chain]);

  const totals = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        unrealized: acc.unrealized + d.unrealizedUsd,
        realized: acc.realized + d.realizedUsd,
        portfolio: acc.portfolio + d.totalUsd,
      }),
      { unrealized: 0, realized: 0, portfolio: 0 }
    );
  }, [data]);

  // 7d / 30d change from portfolio history
  const change = useMemo(() => {
    try {
      const raw = localStorage.getItem('portfolio-history-v2');
      if (!raw) return { d7: 0, d30: 0 };
      const history = JSON.parse(raw) as Array<{ date: string; value: number }>;
      if (history.length === 0) return { d7: 0, d30: 0 };
      const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
      const today = sorted[sorted.length - 1].value;
      const find = (days: number) => {
        const target = sorted[Math.max(0, sorted.length - 1 - days)];
        return target ? ((today - target.value) / target.value) * 100 : 0;
      };
      return { d7: find(7), d30: find(30) };
    } catch { return { d7: 0, d30: 0 }; }
  }, [data]);

  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Total summary */}
      <div className="glass-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            {chain === 'all' ? 'Total PnL (všetky siete)' : `Total PnL · ${chain.toUpperCase()}`}
          </h3>
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`font-semibold ${change.d7 >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
              7d {change.d7 >= 0 ? '+' : ''}{change.d7.toFixed(1)}%
            </span>
            <span className={`font-semibold ${change.d30 >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
              30d {change.d30 >= 0 ? '+' : ''}{change.d30.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Nerealizovaný</p>
            <p className={`text-sm font-bold ${totals.unrealized >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
              {totals.unrealized >= 0 ? '+' : ''}{formatUsd(totals.unrealized)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Realizovaný</p>
            <p className="text-sm font-bold text-foreground">{formatUsd(totals.realized)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Portfólio</p>
            <p className="text-sm font-bold text-foreground">{formatUsd(totals.portfolio)}</p>
          </div>
        </div>
      </div>

      {/* Per-chain cards */}
      <div className="space-y-2">
        {data.map(d => {
          const TrendIcon = d.unrealizedUsd > 0 ? TrendingUp : d.unrealizedUsd < 0 ? TrendingDown : Minus;
          const trendColor = d.unrealizedUsd > 0 ? 'text-emerald-500' : d.unrealizedUsd < 0 ? 'text-destructive' : 'text-muted-foreground';
          return (
            <div key={d.symbol} className="glass-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="font-bold text-sm text-foreground">{d.symbol}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {d.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </span>
                </div>
                <TrendIcon className={`w-4 h-4 ${trendColor}`} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <p className="text-[10px] text-muted-foreground">Nerealizovaný</p>
                  <p className={`font-semibold ${trendColor}`}>
                    {d.unrealizedUsd >= 0 ? '+' : ''}{formatUsd(d.unrealizedUsd)}
                  </p>
                  <p className={`text-[10px] ${trendColor}`}>
                    {d.unrealizedPct >= 0 ? '+' : ''}{d.unrealizedPct.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">v {d.symbol}</p>
                  <p className={`font-semibold font-mono ${trendColor}`}>
                    {d.nativeProfit >= 0 ? '+' : ''}{d.nativeProfit.toFixed(6)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    avg ${d.avgCost > 0 ? d.avgCost.toFixed(2) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Realizovaný</p>
                  <p className="font-semibold text-foreground">{formatUsd(d.realizedUsd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Hodnota</p>
                  <p className="font-semibold text-foreground">{formatUsd(d.totalUsd)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
