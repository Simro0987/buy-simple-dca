import { useEffect, useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, ExternalLink, Clock, ShieldAlert, Target } from 'lucide-react';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { useDefiApys } from '@/hooks/useDefiApys';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { Lang } from '@/lib/i18n';
import {
  computeRecommendations,
  recordSnapshot,
  Recommendation,
  Priority,
  RiskLevel,
  Horizon,
} from '@/lib/decisionEngine';

interface Props { lang: Lang; }

function priorityClasses(p: Priority) {
  switch (p) {
    case 'P0': return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'P1': return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    case 'P2': return 'bg-primary/15 text-primary border-primary/30';
  }
}

function riskClasses(r: RiskLevel) {
  switch (r) {
    case 'low': return 'text-emerald-500';
    case 'medium': return 'text-amber-500';
    case 'high': return 'text-destructive';
  }
}

function horizonLabel(h: Horizon) {
  return h === 'short' ? 'Krátky' : h === 'mid' ? 'Stredný' : 'Dlhý';
}

function riskLabel(r: RiskLevel) {
  return r === 'low' ? 'Nízke' : r === 'medium' ? 'Stredné' : 'Vysoké';
}

export function TodayDecisions({ lang }: Props) {
  const { data: prices } = usePrices();
  const { data: athData } = useAthData();
  const { data: fearGreed } = useFearGreed();
  const { data: altSeason } = useAltSeason();
  const { data: advanced } = useAdvancedMarket();
  const { data: apys } = useDefiApys();
  const cycle = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });
  const [expanded, setExpanded] = useState<string | null>(null);

  // Snapshot for delta detection (ďalšie komponenty)
  useEffect(() => {
    recordSnapshot({ prices, advanced, apys, cycle });
  }, [prices, advanced, apys, cycle]);

  const recs = computeRecommendations({ prices, athData, cycle, advanced, apys });

  if (recs.length === 0) return null;

  return (
    <div className="glass-card p-3 space-y-2 border-primary/20">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
          Čo robiť dnes
        </h2>
        <span className="ml-auto text-[10px] text-muted-foreground">TOP {recs.length}</span>
      </div>

      <div className="space-y-2">
        {recs.map(rec => {
          const open = expanded === rec.id;
          return (
            <DecisionCard
              key={rec.id}
              rec={rec}
              open={open}
              onToggle={() => setExpanded(open ? null : rec.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function DecisionCard({ rec, open, onToggle }: { rec: Recommendation; open: boolean; onToggle: () => void; }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-2.5 flex items-start gap-2 text-left active:bg-secondary/50"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${priorityClasses(rec.priority)}`}>
              {rec.priority}
            </span>
            <span className="text-sm font-bold text-foreground truncate">{rec.action}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{rec.reason}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Target className="w-3 h-3" /> {rec.confidence}%
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" /> {horizonLabel(rec.horizon)}
            </span>
            <span className={`flex items-center gap-0.5 ${riskClasses(rec.risk)}`}>
              <ShieldAlert className="w-3 h-3" /> {riskLabel(rec.risk)}
            </span>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/50">
          <div className="pt-2">
            <p className="text-[10px] font-bold text-foreground uppercase tracking-wide mb-1">PREČO</p>
            <ul className="space-y-1">
              {rec.why.map((line, i) => (
                <li key={i} className="text-[11px] text-muted-foreground leading-snug flex gap-1.5">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          {rec.cta && (
            <a
              href={rec.cta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded bg-primary/10 text-primary text-[11px] font-medium border border-primary/20 hover:bg-primary/20"
            >
              {rec.cta.label} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
