import { formatUsd, formatPrice, formatQuantity } from '@/lib/crypto';
import type { MondayPlan } from '@/lib/mondayController';

interface Props { plan: MondayPlan; onProceed?: () => void; }

export function BreakdownTable({ plan, onProceed }: Props) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-foreground">Breakdown</h2>
        <span className="text-[10px] text-muted-foreground">60% Market · 40% Limit</span>
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
              <th className="text-right py-1 px-1 font-semibold">Total</th>
              <th className="text-right py-1 px-1 font-semibold">Market 60%</th>
              <th className="text-right py-1 px-1 font-semibold">Limit 40%</th>
              <th className="text-right py-1 px-1 font-semibold">Limit @</th>
            </tr>
          </thead>
          <tbody>
            {plan.perAsset.map(a => (
              <tr key={a.symbol} className="border-t border-border/50">
                <td className="py-1.5 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                    <span className="font-semibold text-foreground">{a.symbol}</span>
                  </div>
                </td>
                <td className="text-right tabular-nums text-muted-foreground">{Math.round(a.weight * 100)}%</td>
                <td className="text-right tabular-nums text-foreground font-semibold">{formatUsd(a.marketUsd + a.limitUsd)}</td>
                <td className="text-right tabular-nums">
                  <div className="text-foreground">{formatUsd(a.marketUsd)}</div>
                  <div className="text-[9px] text-muted-foreground">≈ {formatQuantity(a.marketQty, a.symbol)}</div>
                </td>
                <td className="text-right tabular-nums">
                  <div className="text-foreground">{formatUsd(a.limitUsd)}</div>
                  <div className="text-[9px] text-muted-foreground">≈ {formatQuantity(a.limitQty, a.symbol)}</div>
                </td>
                <td className="text-right tabular-nums text-foreground">
                  <div>{formatPrice(a.limitPrice)}</div>
                  <div className="text-[9px] text-emerald-400">−{a.limitDiscountPct.toFixed(1)}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
