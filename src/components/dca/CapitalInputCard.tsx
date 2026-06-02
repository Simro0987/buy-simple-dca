import { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';

interface Props {
  capital: number;
  onCapitalChange: (n: number) => void;
}

const QUICK = [50, 100, 200, 500, 1000];

/**
 * Part 5/5a — Single weekly investment input.
 * Total capital + horizon are managed globally (Settings); user only picks how much to deploy this week.
 */
export function CapitalInputCard({ capital, onCapitalChange }: Props) {
  const [weekly, setWeekly] = useState<number>(capital || 100);

  // Keep local state in sync if outer changes (e.g., reset)
  useEffect(() => {
    if (capital && capital !== weekly) setWeekly(capital);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capital]);

  const apply = (val: number) => {
    setWeekly(val);
    onCapitalChange(val);
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Weekly Investment</h2>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wide">
          Týždenná suma na DCA (USD)
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={weekly}
          onChange={e => {
            const v = Number(e.target.value) || 0;
            setWeekly(v);
            onCapitalChange(v); // live update — breakdown 64/25/11 prepočíta okamžite
          }}
          className="mt-1 w-full bg-secondary border border-border rounded-lg px-3 py-2 text-lg font-semibold text-foreground tabular-nums focus:outline-none focus:border-primary"
        />
      </label>

      <div className="flex items-center justify-between text-[10px] tabular-nums">
        <span className="text-muted-foreground uppercase tracking-wide">Anchor split</span>
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/30">
          BTC 64% · ETH 25% · SOL 11%
        </span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {QUICK.map(v => (
          <button
            key={v}
            onClick={() => apply(v)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold tabular-nums ${
              weekly === v ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
          >
            ${v.toLocaleString()}
          </button>
        ))}
      </div>

      <div className="bg-secondary/60 rounded-lg p-3">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Týždenný kapitál</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{formatUsd(weekly)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          DCA horizont a celkový kapitál spravuj v Nastaveniach.
        </p>
      </div>
    </div>
  );
}
