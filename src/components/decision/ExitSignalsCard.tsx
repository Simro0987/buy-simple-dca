import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { usePrices, useAthData } from '@/hooks/usePrices';
import { computeExitSignals, ExitSignal } from '@/lib/decisionEngine';

function verdictMeta(v: ExitSignal['verdict']) {
  switch (v) {
    case 'reduce_exposure':
      return { label: 'Znížiť expozíciu', cls: 'bg-destructive/15 text-destructive border-destructive/30' };
    case 'take_partial_profit':
      return { label: 'Realizovať čiastočný zisk', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' };
    case 'hold':
      return { label: 'Držať', cls: 'bg-primary/15 text-primary border-primary/30' };
  }
}

function severityIcon(s: ExitSignal['severity']) {
  return s === 'high' ? 'text-destructive' : s === 'medium' ? 'text-amber-500' : 'text-muted-foreground';
}

export function ExitSignalsCard() {
  const { data: advanced } = useAdvancedMarket();
  const { data: athData } = useAthData();
  const { data: prices } = usePrices();
  const signals = computeExitSignals(advanced, athData, prices);

  if (signals.length === 0) return null;

  return (
    <div className="glass-card p-3 space-y-2 border-amber-500/20">
      <div className="flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
          Kedy redukovať riziko
        </h2>
      </div>
      <div className="space-y-1.5">
        {signals.map((s, i) => {
          const meta = verdictMeta(s.verdict);
          return (
            <div key={i} className="rounded-md border border-border bg-secondary/30 p-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${severityIcon(s.severity)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">{s.trigger}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{s.detail}</p>
                  <span className={`inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.cls}`}>
                    → {meta.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
