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

interface AddEntryDialogProps {
  trigger: React.ReactNode;
  existingDates: string[];
  onSaved: () => void;
}

function AddManualEntryDialog({ trigger, existingDates, onSaved }: AddEntryDialogProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [totalPL, setTotalPL] = useState('');
  const [totalPLPct, setTotalPLPct] = useState('');
  const [btcPL, setBtcPL] = useState('');
  const [ethPL, setEthPL] = useState('');
  const [solPL, setSolPL] = useState('');

  const reset = () => {
    setDate(new Date());
    setTotalPL(''); setTotalPLPct('');
    setBtcPL(''); setEthPL(''); setSolPL('');
  };

  const handleSave = () => {
    const total = parseFloat(totalPL);
    if (Number.isNaN(total)) {
      toast.error('Zadaj platný Total P/L v USD');
      return;
    }
    const dateStr = format(date, 'yyyy-MM-dd');
    const pct = parseFloat(totalPLPct);
    const btc = parseFloat(btcPL);
    const eth = parseFloat(ethPL);
    const sol = parseFloat(solPL);

    savePLSnapshot({
      date: dateStr,
      totalPL: total,
      totalPLPct: Number.isNaN(pct) ? 0 : pct,
      btcPL: Number.isNaN(btc) ? 0 : btc,
      ethPL: Number.isNaN(eth) ? 0 : eth,
      solPL: Number.isNaN(sol) ? 0 : sol,
    });

    const wasUpdate = existingDates.includes(dateStr);
    toast.success(wasUpdate ? `Záznam ${dateStr} aktualizovaný` : `Záznam ${dateStr} pridaný`);
    reset();
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Pridať historický P/L záznam</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Dátum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal h-9', !date && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, 'dd.MM.yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  disabled={(d) => d > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            {existingDates.includes(format(date, 'yyyy-MM-dd')) && (
              <p className="text-[10px] text-warning">⚠️ Záznam pre tento dátum existuje a bude prepísaný</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Total P/L (USD) *</Label>
              <Input type="number" inputMode="decimal" placeholder="napr. 1250" value={totalPL} onChange={(e) => setTotalPL(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Total P/L (%)</Label>
              <Input type="number" inputMode="decimal" placeholder="napr. 12.5" value={totalPLPct} onChange={(e) => setTotalPLPct(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground">Voliteľne — rozpis na tokeny (USD)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" inputMode="decimal" placeholder="BTC" value={btcPL} onChange={(e) => setBtcPL(e.target.value)} className="h-9" />
              <Input type="number" inputMode="decimal" placeholder="ETH" value={ethPL} onChange={(e) => setEthPL(e.target.value)} className="h-9" />
              <Input type="number" inputMode="decimal" placeholder="SOL" value={solPL} onChange={(e) => setSolPL(e.target.value)} className="h-9" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Zrušiť</Button>
          <Button onClick={handleSave}>Uložiť</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ManageDialogProps {
  data: PLSnapshot[];
  onChange: () => void;
}

function ManageEntriesDialog({ data, onChange }: ManageDialogProps) {
  const [open, setOpen] = useState(false);
  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));

  const handleDelete = (date: string) => {
    deletePLSnapshot(date);
    toast.success(`Záznam ${date} vymazaný`);
    onChange();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-[10px] text-muted-foreground hover:text-foreground underline">
          spravovať
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Spravovať záznamy ({data.length})</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {sorted.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Žiadne záznamy</p>
          )}
          {sorted.map((s) => (
            <div key={s.date} className="flex items-center justify-between rounded-lg bg-secondary/50 p-2">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">{s.date}</span>
                <span className={`text-[10px] font-bold ${s.totalPL >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {s.totalPL >= 0 ? '+' : ''}${s.totalPL.toFixed(2)} ({s.totalPLPct >= 0 ? '+' : ''}{s.totalPLPct.toFixed(1)}%)
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(s.date)} aria-label={`Vymazať ${s.date}`}>
                <Trash2 className="w-3.5 h-3.5 text-loss" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PLHistoryChart({ data, onChange }: Props) {
  const [version, setVersion] = useState(0);
  const handleChanged = () => {
    setVersion(v => v + 1);
    onChange?.();
  };
  const existingDates = useMemo(() => data.map(d => d.date), [data, version]);

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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">P/L História</span>
          </div>
          <AddManualEntryDialog
            existingDates={existingDates}
            onSaved={handleChanged}
            trigger={
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
                <Plus className="w-3 h-3" /> Pridať záznam
              </Button>
            }
          />
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          {chartData.length === 0
            ? 'Žiadne dáta. Pridaj historický záznam manuálne pre okamžité naplnenie grafu.'
            : 'Minimálne 2 dni dát potrebné pre graf. Pridaj ďalší záznam manuálne alebo počkaj.'}
        </p>
        {chartData.length === 1 && (
          <div className="flex justify-center">
            <ManageEntriesDialog data={data} onChange={handleChanged} />
          </div>
        )}
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
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{chartData.length} dní</span>
          <ManageEntriesDialog data={data} onChange={handleChanged} />
          <AddManualEntryDialog
            existingDates={existingDates}
            onSaved={handleChanged}
            trigger={
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
                <Plus className="w-3 h-3" /> Pridať
              </Button>
            }
          />
        </div>
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
