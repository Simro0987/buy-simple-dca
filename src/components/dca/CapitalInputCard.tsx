import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';

interface Props {
  capital: number;
  onCapitalChange: (n: number) => void;
}

const QUICK = [1000, 5000, 10000, 25000, 50000];
const HORIZONS = [
  { id: '6M', weeks: 26 },
  { id: '12M', weeks: 52 },
  { id: '18M', weeks: 78 },
  { id: '24M', weeks: 104 },
] as const;
type CapitalType = 'one_time' | 'monthly' | 'bonus';

export function CapitalInputCard({ capital, onCapitalChange }: Props) {
  const [total, setTotal] = useState<number>(capital * 52); // assume current weekly = total/52
  const [type, setType] = useState<CapitalType>('one_time');
  const [horizon, setHorizon] = useState<string>('12M');

  const weeks = HORIZONS.find(h => h.id === horizon)!.weeks;
  const weekly = type === 'monthly' ? Math.round((total * 12) / 52) : Math.round(total / weeks);

  const apply = () => onCapitalChange(weekly);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Capital Setup</h2>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wide">Dostupný kapitál (USD)</span>
        <input
          type="number"
          value={total}
          onChange={e => setTotal(Number(e.target.value) || 0)}
          className="mt-1 w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground tabular-nums focus:outline-none focus:border-primary"
        />
      </label>

      <div className="flex gap-1 flex-wrap">
        {QUICK.map(v => (
          <button
            key={v}
            onClick={() => setTotal(v)}
            className="px-2 py-1 rounded-md bg-secondary text-[11px] font-semibold text-foreground hover:bg-secondary/80"
          >
            ${v.toLocaleString()}
          </button>
        ))}
      </div>

      <div>
        <p className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">Typ kapitálu</p>
        <div className="grid grid-cols-3 gap-1">
          {([
            { id: 'one_time' as const, label: 'Jednorazový' },
            { id: 'monthly' as const,  label: 'Mesačný' },
            { id: 'bonus' as const,    label: 'Bonus' },
          ]).map(o => (
            <button
              key={o.id}
              onClick={() => setType(o.id)}
              className={`py-1.5 rounded-md text-[11px] font-semibold ${
                type === o.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >{o.label}</button>
          ))}
        </div>
      </div>

      {type !== 'monthly' && (
        <div>
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">DCA horizont</p>
          <div className="grid grid-cols-4 gap-1">
            {HORIZONS.map(h => (
              <button
                key={h.id}
                onClick={() => setHorizon(h.id)}
                className={`py-1.5 rounded-md text-[11px] font-semibold ${
                  horizon === h.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >{h.id}</button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end justify-between bg-secondary/60 rounded-lg p-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Týždenný kapitál</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{formatUsd(weekly)}</p>
        </div>
        <button
          onClick={apply}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95"
        >
          Použiť
        </button>
      </div>
    </div>
  );
}
