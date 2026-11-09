import { formatUsd, formatQuantity } from '@/lib/crypto';
import type { MondayPlan } from '@/lib/mondayController';

interface Props { plan: MondayPlan; onProceed?: () => void; }

/**
 * High-level allocation breakdown: weight, total USD, ~quantity at market price.
 * Per-coin Market/Limit split (incl. distance) is rendered ONLY by
 * <DynamicExecutionCard /> to avoid UI/data duplication.
 */
export function BreakdownTable({ plan, onProceed }: Props) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-foreground">Breakdown</h2>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
          Anchor 64/25/11
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <p className="text-[10px] uppercase text-emerald-400 tracking-wide font-semibold">Invest this week</p>
          <p className="text-2xl font-bold text-emerald-300 tabular-nums">{formatUsd(plan.investableUsd)}</p>
        </div>
        <div className="bg-secondary/60 rounded-lg p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide font-semibold">Cash reserve</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{formatUsd(plan.reservedUsd)}</p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase text-muted-foreground tracking-wide">
              <th className="text-left py-1 px-1 font-semibold">Coin</th>
              <th className="text-right py-1 px-1 font-semibold">%</th>
              <th className="text-right py-1 px-1 font-semibold">USD</th>
              <th className="text-right py-1 px-1 font-semibold">~ Množstvo</th>
            </tr>
          </thead>
          <tbody>
            {plan.perAsset.map(a => {
              const totalUsd = a.marketUsd + a.limitUsd;
              const totalQty = a.marketQty + a.limitQty;
              return (
                <tr key={a.symbol} className="border-t border-border/50">
                  <td className="py-1.5 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                      <span className="font-semibold text-foreground">{a.symbol}</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">{Math.round(a.weight * 100)}%</td>
                  <td className="text-right tabular-nums text-foreground font-semibold">{formatUsd(totalUsd)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {totalQty > 0 ? `${formatQuantity(totalQty, a.symbol)} ${a.symbol}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Per-coin rozdelenie Market/Limit a vzdialenosť limitov sa počítajú dynamicky nižšie v sekcii
        <span className="text-foreground"> Dynamic Execution Engine</span>.
      </p>

      {onProceed && (
        <button
          onClick={onProceed}
          className="mt-4 w-full py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-bold active:scale-95"
        >
          ✅ Proceed to execution plan
        </button>
      )}
    </div>
  );
}
