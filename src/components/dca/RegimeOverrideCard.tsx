import type { Regime } from '@/lib/mondayController';

interface Props {
  detectedRegime: Regime;
  override: Regime | 'auto';
  onChange: (v: Regime | 'auto') => void;
}

const REGIMES: { id: Regime | 'auto'; label: string; mult: string }[] = [
  { id: 'auto',     label: 'AUTO',      mult: '—' },
  { id: 'bull',     label: 'BULL',      mult: '×1.00' },
  { id: 'bear',     label: 'BEAR',      mult: '×1.15' },
  { id: 'sideways', label: 'SIDEWAYS',  mult: '×0.85' },
  { id: 'panic',    label: 'PANIC',     mult: '×1.30' },
  { id: 'euphoria', label: 'EUPHORIA',  mult: '×0.60' },
];

export function RegimeOverrideCard({ detectedRegime, override, onChange }: Props) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-foreground">Trhový režim</h2>
        <span className="text-[10px] text-muted-foreground">
          Detekovaný: <span className="font-semibold text-foreground">{detectedRegime.toUpperCase()}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {REGIMES.map(r => (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            className={`py-1.5 px-1 rounded-md text-[10px] font-semibold ${
              override === r.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            <div>{r.label}</div>
            <div className="text-[9px] opacity-70 tabular-nums">{r.mult}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
