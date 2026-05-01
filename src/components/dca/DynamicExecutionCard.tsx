import { useMemo } from 'react';
import { Zap, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import {
  calcCoinExecution,
  fixedExecution,
  overallNarrative,
  type CoinKey,
  type CoinExecution,
} from '@/lib/dynamicExecution';
import { formatPrice, type PriceData } from '@/lib/crypto';

interface Props {
  score: number;
  prices: PriceData | undefined;
}

const COIN_PRICE_KEY: Record<CoinKey, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
};

/**
 * Part 5/5a — Engine is ALWAYS automatic. No ON/OFF toggle, no manual overrides.
 * Falls back to fixed 60/40 only while 30D metrics are still loading.
 */
export function DynamicExecutionCard({ score, prices }: Props) {
  const { data: metrics, isLoading } = usePerCoinMetrics();

  const executions: CoinExecution[] = useMemo(() => {
    const coins: CoinKey[] = ['btc', 'eth', 'sol'];
    if (!metrics) return coins.map(fixedExecution);
    return coins.map(c => calcCoinExecution(c, score, metrics[c]));
  }, [metrics, score]);

  const narrative = overallNarrative(executions);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Dynamic Execution Engine</h3>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-primary/15 text-primary">
          AUTO
        </span>
      </div>

      {isLoading && (
        <p className="text-[11px] text-muted-foreground">Načítavam 30D volatilitu a momentum…</p>
      )}

      <div className="space-y-2">
        {executions.map(e => {
          const price = prices?.[COIN_PRICE_KEY[e.coin]]?.usd ?? 0;
          const limitPrice = price * (1 + e.limitDistancePct / 100);
          const MomIcon = e.momentum30d >= 0 ? TrendingUp : TrendingDown;
          const momColor = e.momentum30d >= 0 ? 'text-emerald-400' : 'text-rose-400';
          return (
            <div key={e.coin} className="bg-secondary/40 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{e.symbol}</span>
                <div className="flex items-center gap-2 text-[10px] tabular-nums">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Activity className="w-3 h-3" /> {e.volatility30d.toFixed(2)}%
                  </span>
                  <span className={`flex items-center gap-1 ${momColor}`}>
                    <MomIcon className="w-3 h-3" />
                    {e.momentum30d >= 0 ? '+' : ''}{e.momentum30d.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-background/50 overflow-hidden flex">
                  <div className="h-full bg-primary" style={{ width: `${e.marketPct}%` }} />
                  <div className="h-full bg-emerald-500/70" style={{ width: `${e.limitPct}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
                  M{Math.round(e.marketPct)} / L{Math.round(e.limitPct)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] tabular-nums">
                <span className="text-muted-foreground">
                  Dist {e.limitDistancePct.toFixed(1)}%
                </span>
                {price > 0 && (
                  <span className="text-foreground">
                    Limit @ {formatPrice(limitPrice)}
                  </span>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground leading-snug">{e.rationale}</p>
            </div>
          );
        })}
      </div>

      {narrative && (
        <p className="text-[11px] text-foreground/80 leading-relaxed pt-1 border-t border-border">
          {narrative}
        </p>
      )}
    </div>
  );
}
