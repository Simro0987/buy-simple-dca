import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TOKENS, formatUsd } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';

interface Props {
  metrics: PortfolioMetrics;
  selected?: 'BTC' | 'ETH' | 'SOL' | null;
  onSelect?: (s: 'BTC' | 'ETH' | 'SOL') => void;
}

export function AllocationDonut({ metrics, selected, onSelect }: Props) {
  const data = metrics.assets.map(a => {
    const t = TOKENS.find(x => x.symbol === a.symbol)!;
    return { name: a.symbol, value: a.value, color: t.color, target: a.targetPct * 100, actual: a.actualPct * 100 };
  });
  const empty = metrics.totalValue <= 0;

  return (
    <div className="glass-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Alokácia</p>
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={empty ? [{ name: '—', value: 1, color: 'hsl(var(--muted))' }] : data}
              dataKey="value"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              stroke="none"
            >
              {(empty ? [{ color: 'hsl(var(--muted))' }] : data).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            {!empty && (
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, n) => [formatUsd(v), n]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Total</p>
          <p className="text-base font-bold text-foreground tabular-nums">{formatUsd(metrics.totalValue)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        {data.map(d => (
          <div key={d.name} className="bg-secondary/60 rounded-md p-1.5 text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
              <span className="text-[10px] font-bold text-foreground">{d.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
              {d.actual.toFixed(1)}% / <span className="opacity-60">{d.target.toFixed(0)}%</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
