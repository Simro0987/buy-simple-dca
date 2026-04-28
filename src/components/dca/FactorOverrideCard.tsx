import { Sliders } from 'lucide-react';
import type { FactorBreakdown, FactorKey } from '@/lib/mondayController';
import { FactorRadarChart } from './FactorRadarChart';

interface Props {
  factors: FactorBreakdown[];
  overrides: Partial<Record<FactorKey, number>>;
  onChange: (key: FactorKey, v: number | undefined) => void;
}

export function FactorOverrideCard({ factors, overrides, onChange }: Props) {
  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Sliders className="w-4 h-4 text-primary" /> 5-faktorové skóre
        </h2>
        {Object.keys(overrides).length > 0 && (
          <button
            onClick={() => factors.forEach(f => onChange(f.key, undefined))}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >Reset overrides</button>
        )}
      </div>

      <FactorRadarChart factors={factors} overrides={overrides} />

      <div className="space-y-2">
        {factors.map(f => {
          const ov = overrides[f.key];
          const value = typeof ov === 'number' ? ov : f.score;
          const isOverride = typeof ov === 'number';
          return (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-foreground">{f.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  váha {Math.round(f.weight * 100)}% · <span className={isOverride ? 'text-amber-400 font-bold' : 'text-foreground font-bold'}>{value}</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={value}
                onChange={e => onChange(f.key, Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Defaultne sa faktory napĺňajú z regime engine (200D MA, F&amp;G, momentum…). Posunutím slidera ich prepíšeš.
      </p>
    </div>
  );
}
