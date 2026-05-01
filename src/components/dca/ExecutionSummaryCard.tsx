import { useMemo } from 'react';
import { ClipboardList } from 'lucide-react';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import {
  calcCoinExecution,
  fixedExecution,
  type CoinExecution,
  type CoinKey,
} from '@/lib/dynamicExecution';
import { calculateDCA, formatUsd, type PriceData } from '@/lib/crypto';

interface Props {
  weeklyCapital: number;
  prices: PriceData | undefined;
  score: number;
}

/**
 * Part 5/5a — "This Week's Execution Summary"
 * Aggregated total Market/Limit USD + per-coin table.
 * Engine is ALWAYS automatic; falls back to fixed 60/40 only while metrics load.
 */
export function ExecutionSummaryCard({ weeklyCapital, prices, score }: Props) {
  const { data: metrics } = usePerCoinMetrics();

  const rows = useMemo(() => {
    if (!prices || weeklyCapital <= 0) return [];
    const base = calculateDCA(weeklyCapital, prices);
    return base.map(r => {
      const coin = r.token.id as CoinKey;
      const exec: CoinExecution = !metrics
        ? fixedExecution(coin)
        : calcCoinExecution(coin, score, metrics[coin]);
      const marketUsd = r.totalUsd * (exec.marketPct / 100);
      const limitUsd = r.totalUsd * (exec.limitPct / 100);
      const qty = r.currentPrice > 0 ? r.totalUsd / r.currentPrice : 0;
      return {
        symbol: r.token.symbol,
        color: r.token.color,
        totalUsd: r.totalUsd,
        marketUsd,
        limitUsd,
        marketPct: exec.marketPct,
        limitPct: exec.limitPct,
        distance: exec.limitDistancePct,
        qty,
        decimals: coin === 'btc' ? 8 : coin === 'eth' ? 4 : 3,
      };
    });
  }, [prices, weeklyCapital, score, metrics]);

  const totalMarket = rows.reduce((s, r) => s + r.marketUsd, 0);
  const totalLimit = rows.reduce((s, r) => s + r.limitUsd, 0);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">This Week's Execution Summary</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Total Market</p>
          <p className="text-lg font-bold text-primary tabular-nums">{formatUsd(totalMarket)}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Total Limit</p>
          <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatUsd(totalLimit)}</p>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[10px] tabular-nums">
            <thead>
              <tr className="text-muted-foreground text-[9px] uppercase">
                <th className="text-left font-normal py-1 px-1">Coin</th>
                <th className="text-right font-normal py-1 px-1">Total $</th>
                <th className="text-right font-normal py-1 px-1">Market</th>
                <th className="text-right font-normal py-1 px-1">Limit</th>
                <th className="text-right font-normal py-1 px-1">Dist</th>
                <th className="text-right font-normal py-1 px-1">~Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.symbol} className="border-t border-border">
                  <td className="py-1.5 px-1">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ backgroundColor: r.color + '20', color: r.color }}
                    >
                      {r.symbol}
                    </span>
                  </td>
                  <td className="text-right py-1.5 px-1 text-foreground font-semibold">
                    ${r.totalUsd.toFixed(2)}
                  </td>
                  <td className="text-right py-1.5 px-1">
                    <span className="text-foreground">${r.marketUsd.toFixed(2)}</span>
                    <span className="text-muted-foreground ml-1">({Math.round(r.marketPct)}%)</span>
                  </td>
                  <td className="text-right py-1.5 px-1">
                    <span className="text-foreground">${r.limitUsd.toFixed(2)}</span>
                    <span className="text-muted-foreground ml-1">({Math.round(r.limitPct)}%)</span>
                  </td>
                  <td className="text-right py-1.5 px-1 text-muted-foreground">
                    {r.distance.toFixed(1)}%
                  </td>
                  <td className="text-right py-1.5 px-1 text-muted-foreground">
                    {r.qty.toFixed(r.decimals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Nastav Weekly Investment.</p>
      )}

      <p className="text-[10px] text-muted-foreground leading-snug">
        Splity sú plne automatické — Engine ich počíta per-coin podľa Score, 30D volatility a 30D momenta.
      </p>
    </div>
  );
}
