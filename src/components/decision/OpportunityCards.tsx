import { ExternalLink, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { useDefiApys } from '@/hooks/useDefiApys';
import { computeYieldOpportunities, YieldOpportunity } from '@/lib/decisionEngine';

function recBadge(r: YieldOpportunity['recommendation']) {
  switch (r) {
    case 'enter': return { label: 'Vstúpiť', cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' };
    case 'reduce': return { label: 'Redukovať', cls: 'bg-destructive/15 text-destructive border-destructive/30' };
    case 'ignore': return { label: 'Ignorovať', cls: 'bg-muted text-muted-foreground border-border' };
  }
}

function riskColor(r: YieldOpportunity['risk']) {
  return r === 'low' ? 'text-emerald-500' : r === 'medium' ? 'text-amber-500' : 'text-destructive';
}

export function OpportunityCards() {
  const { data: apys } = useDefiApys();
  const opps = computeYieldOpportunities(apys);
  if (opps.length === 0) return null;

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
          Najlepšie yield príležitosti
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {opps.map(o => {
          const badge = recBadge(o.recommendation);
          const DeltaIcon = (o.apyDelta ?? 0) >= 0 ? TrendingUp : TrendingDown;
          return (
            <a
              key={o.protocol}
              href={o.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border bg-secondary/30 p-2.5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{o.protocol}</p>
                  <p className="text-[10px] text-muted-foreground">{o.asset}</p>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <div>
                  <p className="text-base font-bold text-foreground">{o.apy.toFixed(2)}%</p>
                  <p className={`text-[10px] ${riskColor(o.risk)}`}>
                    Riziko: {o.risk === 'low' ? 'Nízke' : o.risk === 'medium' ? 'Stredné' : 'Vysoké'}
                  </p>
                </div>
                <div className="text-right">
                  {o.apyDelta != null && Math.abs(o.apyDelta) >= 0.05 && (
                    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${(o.apyDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                      <DeltaIcon className="w-3 h-3" />
                      {o.apyDelta >= 0 ? '+' : ''}{o.apyDelta.toFixed(2)} pp
                    </span>
                  )}
                  <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto mt-1" />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
