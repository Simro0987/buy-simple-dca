import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, Plus, Trash2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PL_HISTORY_KEY = 'pl-history-v2';
const MAX_POINTS = 90;

export interface PLSnapshot {
  date: string; // YYYY-MM-DD
  totalPL: number;
  totalPLPct: number;
  btcPL: number;
  ethPL: number;
  solPL: number;
}

export function getPLHistory(): PLSnapshot[] {
  try {
    return JSON.parse(localStorage.getItem(PL_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function savePLSnapshot(snapshot: PLSnapshot) {
  const history = getPLHistory();
  const idx = history.findIndex(h => h.date === snapshot.date);
  if (idx >= 0) history[idx] = snapshot;
  else history.push(snapshot);
  history.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = history.slice(-MAX_POINTS);
  localStorage.setItem(PL_HISTORY_KEY, JSON.stringify(trimmed));
}

export function deletePLSnapshot(date: string) {
  const history = getPLHistory().filter(h => h.date !== date);
  localStorage.setItem(PL_HISTORY_KEY, JSON.stringify(history));
}

interface Props {
  data: PLSnapshot[];
  onChange?: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as PLSnapshot;
  if (!d) return null;

  const formatDate = (dateStr: string) => {
    const [, m, day] = dateStr.split('-');
    return `${day}.${m}.`;
  };

  return (
    <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-medium text-foreground">{formatDate(label)}</p>
      <p className={`font-bold ${d.totalPL >= 0 ? 'text-gain' : 'text-loss'}`}>
        {d.totalPL >= 0 ? '+' : ''}${Math.abs(d.totalPL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        {' '}({d.totalPLPct >= 0 ? '+' : ''}{d.totalPLPct.toFixed(1)}%)
      </p>
      <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 pt-1 border-t border-border/50">
        {[
          { label: 'BTC', value: d.btcPL, color: '#F7931A' },
          { label: 'ETH', value: d.ethPL, color: '#627EEA' },
          { label: 'SOL', value: d.solPL, color: '#00FFA3' },
        ].map(t => (
          <div key={t.label} className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="text-muted-foreground">{t.label}</span>
            <span className={`ml-auto font-medium ${t.value >= 0 ? 'text-gain' : 'text-loss'}`}>
              {t.value >= 0 ? '+' : ''}${Math.abs(t.value).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function PLHistoryChart({ data }: Props) {
  const chartData = useMemo(() => {
    return data.map(d => ({
      ...d,
      displayDate: (() => {
        const [, m, day] = d.date.split('-');
        return `${day}.${m}`;
      })(),
    }));
  }, [data]);

  if (chartData.length < 2) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">P/L História</span>
        </div>
        <p className="text-xs text-muted-foreground text-center py-6">
          Minimálne 2 dni dát potrebné pre graf. Dáta sa ukladajú automaticky.
        </p>
      </div>
    );
  }

  const minPL = Math.min(...chartData.map(d => d.totalPL));
  const maxPL = Math.max(...chartData.map(d => d.totalPL));
  const absMax = Math.max(Math.abs(minPL), Math.abs(maxPL)) * 1.1;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold text-foreground">P/L História</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {chartData.length} dní
        </span>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="plGradientPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--gain))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--gain))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="plGradientNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--loss))" stopOpacity={0} />
                <stop offset="100%" stopColor="hsl(var(--loss))" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)}`}
              domain={[minPL < 0 ? -absMax : 'auto', maxPL > 0 ? absMax : 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
            <Area
              type="monotone"
              dataKey="totalPL"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#plGradientPos)"
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
