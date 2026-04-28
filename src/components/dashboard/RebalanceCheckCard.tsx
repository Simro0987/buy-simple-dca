import { CheckCircle2, AlertCircle } from 'lucide-react';
import { TOKENS } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';

interface Props { metrics: PortfolioMetrics; thresholdPct?: number; }

export function RebalanceCheckCard({ metrics, thresholdPct = 5 }: Props) {
  return (
    <div className="glass-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Rebalance check</p>
      <div className="space-y-2">
        {metrics.assets.map(a => {
          const t = TOKENS.find(x => x.symbol === a.symbol)!;
          const need = Math.abs(a.deviationPct) > thresholdPct;
          return (
            <div key={a.symbol} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                <span className="font-semibold text-foreground w-10">{a.symbol}</span>
                <span className="text-muted-foreground tabular-nums">
                  {(a.actualPct * 100).toFixed(1)}% <span className="opacity-50">/ {(a.targetPct * 100).toFixed(0)}%</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`tabular-nums font-semibold ${need ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {a.deviationPct >= 0 ? '+' : ''}{a.deviationPct.toFixed(1)} pp
                </span>
                {need
                  ? <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-3">Threshold ±{thresholdPct} pp od cieľovej alokácie.</p>
    </div>
  );
}
