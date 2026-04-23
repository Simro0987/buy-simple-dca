import { ArrowUp, ArrowDown, Activity } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { useDefiApys } from '@/hooks/useDefiApys';
import { computeRiskChanges, RiskChange } from '@/lib/decisionEngine';

function toneClasses(tone: RiskChange['tone']) {
  switch (tone) {
    case 'positive': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    case 'negative': return 'text-destructive bg-destructive/10 border-destructive/20';
    case 'neutral': return 'text-muted-foreground bg-secondary/50 border-border';
  }
}

export function RiskChangeBadges() {
  const { data: prices } = usePrices();
  const { data: advanced } = useAdvancedMarket();
  const { data: apys } = useDefiApys();

  const changes = computeRiskChanges({ prices, advanced, apys });
  if (changes.length === 0) return null;

  return (
    <div className="glass-card p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Activity className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
          Zmeny od poslednej kontroly
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {changes.map(c => {
          const Icon = c.direction === 'up' ? ArrowUp : ArrowDown;
          const sign = c.delta >= 0 ? '+' : '';
          return (
            <div
              key={c.key}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium ${toneClasses(c.tone)}`}
            >
              <Icon className="w-3 h-3" />
              <span>{c.label}</span>
              <span className="font-bold">{sign}{c.delta.toFixed(c.unit === 'bps' ? 0 : 2)}{c.unit}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
