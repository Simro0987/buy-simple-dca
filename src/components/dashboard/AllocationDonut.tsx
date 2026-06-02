import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TOKENS, formatUsd } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { usePortfolio } from '@/contexts/PortfolioContext';

interface Props {
  metrics: PortfolioMetrics;
  selected?: 'BTC' | 'ETH' | 'SOL' | null;
  onSelect?: (s: 'BTC' | 'ETH' | 'SOL') => void;
}

type Slice = {
  name: string;        // 'BTC' | 'ETH' | 'SOL'
  label: string;       // 'BTC', 'ETH (liquid)', 'ETH [Staked]'
  value: number;
  color: string;
  staked: boolean;
};

export function AllocationDonut({ metrics, selected, onSelect }: Props) {
  const { breakdown } = usePortfolio();

  // Build chart slices: per-asset split into liquid + staked (when applicable)
  const slices: Slice[] = [];
  const legend = metrics.assets.map(a => {
    const t = TOKENS.find(x => x.symbol === a.symbol)!;
    const b = breakdown.find(x => x.symbol === a.symbol);
    const stakedValue = b?.stakedValue ?? 0;
    const holdValue = b?.holdValue ?? a.value;
    const stakedPct = a.value > 0 ? (stakedValue / a.value) * 100 : 0;

    if (a.value > 0) {
      if (stakedValue > 0 && holdValue > 0) {
        slices.push({ name: a.symbol, label: `${a.symbol} (liquid)`, value: holdValue, color: t.color, staked: false });
        slices.push({ name: a.symbol, label: `${a.symbol} [Staked]`, value: stakedValue, color: t.color, staked: true });
      } else {
        slices.push({ name: a.symbol, label: a.symbol, value: a.value, color: t.color, staked: false });
      }
    }
    return {
      name: a.symbol,
      value: a.value,
      color: t.color,
      target: a.targetPct * 100,
      actual: a.actualPct * 100,
      stakedValue,
      stakedPct,
    };
  });

  const empty = metrics.totalValue <= 0 || slices.length === 0;
  const chartData = empty ? [{ name: '—', label: '—', value: 1, color: 'hsl(var(--muted))', staked: false }] : slices;

  return (
    <div className="glass-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Alokácia</p>
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              stroke="none"
              onClick={(d: { name?: string }) => {
                if (!empty && onSelect && d?.name && ['BTC', 'ETH', 'SOL'].includes(d.name)) {
                  onSelect(d.name as 'BTC' | 'ETH' | 'SOL');
                }
              }}
              cursor={onSelect ? 'pointer' : 'default'}
            >
              {chartData.map((d, i) => {
                const dim = !empty && selected && d.name !== selected;
                const baseOpacity = d.staked ? 0.45 : 1;
                return (
                  <Cell
                    key={i}
                    fill={d.color}
                    fillOpacity={dim ? 0.18 : baseOpacity}
                  />
                );
              })}
            </Pie>
            {!empty && (
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, _n, item: any) => [formatUsd(v), item?.payload?.label ?? item?.name]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[9px] uppercase text-muted-foreground tracking-wider">{selected ?? 'Total'}</p>
          <p className="text-base font-bold text-foreground tabular-nums">
            {formatUsd(selected ? (legend.find(d => d.name === selected)?.value ?? 0) : metrics.totalValue)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        {legend.map(d => {
          const active = selected === d.name;
          const dim = selected && !active;
          const drift = d.actual - d.target;
          const driftAbs = Math.abs(drift);
          const driftColor = driftAbs < 2 ? 'text-muted-foreground' : driftAbs < 5 ? 'text-yellow-400' : 'text-loss';
          const arrow = driftAbs < 0.5 ? '·' : drift > 0 ? '▲' : '▼';
          return (
            <button
              key={d.name}
              onClick={() => onSelect?.(d.name as 'BTC' | 'ETH' | 'SOL')}
              className={`bg-secondary/60 rounded-md p-1.5 text-center transition-opacity ${dim ? 'opacity-40' : ''} ${active ? 'ring-1 ring-primary' : ''}`}
            >
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-[10px] font-bold text-foreground">{d.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                {d.actual.toFixed(1)}% / <span className="opacity-60">{d.target.toFixed(0)}%</span>
              </p>
              <p className={`text-[9px] tabular-nums font-medium ${driftColor}`}>
                {arrow} {drift >= 0 ? '+' : ''}{drift.toFixed(1)}pp
              </p>
              {d.stakedValue > 0 && (
                <p className="text-[9px] tabular-nums text-primary/80 mt-0.5">
                  🔒 {d.stakedPct.toFixed(0)}% staked
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
