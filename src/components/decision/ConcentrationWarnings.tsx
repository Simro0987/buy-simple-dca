import { AlertTriangle } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';
import { computeConcentrationWarnings, ConcentrationWarning } from '@/lib/decisionEngine';

function levelClasses(l: ConcentrationWarning['level']) {
  switch (l) {
    case 'low': return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500';
    case 'medium': return 'border-amber-500/30 bg-amber-500/5 text-amber-500';
    case 'high': return 'border-destructive/30 bg-destructive/5 text-destructive';
  }
}

function levelLabel(l: ConcentrationWarning['level']) {
  return l === 'low' ? 'NÍZKE' : l === 'medium' ? 'STREDNÉ' : 'VYSOKÉ';
}

export function ConcentrationWarnings() {
  const { data: prices } = usePrices();
  const warnings = computeConcentrationWarnings(prices);
  if (warnings.length === 0) return null;

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
          Koncentračné riziko
        </h2>
      </div>
      <div className="space-y-1.5">
        {warnings.map((w, i) => (
          <div key={i} className={`rounded-md border p-2.5 ${levelClasses(w.level)}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-foreground">{w.title}</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-background/50">
                {levelLabel(w.level)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{w.message}</p>
            <p className="text-[11px] text-foreground mt-1 leading-snug">→ {w.recommendation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
