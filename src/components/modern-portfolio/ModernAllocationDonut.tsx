import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TOKENS, formatUsd } from '@/lib/crypto';
import { Bento, Label, Money } from '@/components/modern-portfolio/primitives';
import type { LiveHoldingMetric } from '@/lib/mockPortfolioHoldings';

interface Slice {
  name: string;
  value: number;
  color: string;
}

interface Props {
  assets: LiveHoldingMetric[];
  totalValue: number;
  selected?: 'BTC' | 'ETH' | 'SOL' | null;
  onSelect?: (s: 'BTC' | 'ETH' | 'SOL') => void;
  loading?: boolean;
}

export function ModernAllocationDonut({ assets, totalValue, selected, onSelect, loading }: Props) {
  const slices: Slice[] = assets
    .filter(a => a.value > 0)
    .map(a => {
      const token = TOKENS.find(t => t.symbol === a.symbol)!;
      return { name: a.symbol, value: a.value, color: token.color };
    });

  const empty = totalValue <= 0 || slices.length === 0;
  const chartData = empty
    ? [{ name: '—', value: 1, color: 'rgba(255,255,255,0.08)' }]
    : slices;

  if (loading) {
    return (
      <Bento className="p-4 sm:p-5 min-w-0">
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-28 rounded bg-white/10" />
          <div className="h-40 rounded-2xl bg-white/[0.04]" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-14 rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </Bento>
    );
  }

  return (
    <Bento delay={0.06} className="p-4 sm:p-5 min-w-0">
      <Label>Alokácia · live USD</Label>
      <div className="relative h-44 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              innerRadius={52}
              outerRadius={78}
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
                return (
                  <Cell
                    key={i}
                    fill={d.color}
                    fillOpacity={dim ? 0.2 : 1}
                  />
                );
              })}
            </Pie>
            {!empty && (
              <Tooltip
                contentStyle={{
                  background: '#0A0A0A',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, _n, item: { payload?: { name?: string } }) => [
                  formatUsd(v),
                  item?.payload?.name ?? '',
                ]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[9px] uppercase text-white/35 tracking-wider">{selected ?? 'Total'}</p>
          <Money size="sm" className="!text-base">
            {formatUsd(selected ? (assets.find(a => a.symbol === selected)?.value ?? 0) : totalValue)}
          </Money>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {assets.map(a => {
          const token = TOKENS.find(t => t.symbol === a.symbol)!;
          const active = selected === a.symbol;
          const dim = selected && !active;
          return (
            <button
              key={a.symbol}
              type="button"
              onClick={() => onSelect?.(a.symbol)}
              className={`rounded-xl border border-white/[0.06] bg-black/30 p-2 text-center transition-all ${
                dim ? 'opacity-40' : ''
              } ${active ? 'ring-1 ring-[#14F195]/40 border-[#14F195]/30' : ''}`}
            >
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: token.color }} />
                <span className="text-[10px] font-bold text-white">{a.symbol}</span>
              </div>
              <p className="text-[10px] text-white/45 font-mono mt-1">
                {(a.actualPct * 100).toFixed(1)}%
              </p>
            </button>
          );
        })}
      </div>
    </Bento>
  );
}
