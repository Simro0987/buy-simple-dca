import { Crosshair, Target, Clock, Zap, ShieldCheck, BarChart3, Coins } from 'lucide-react';
import { usePrices, useAthData, useFearGreed, useAltSeason } from '@/hooks/usePrices';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { useDefiApys } from '@/hooks/useDefiApys';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { Lang } from '@/lib/i18n';
import { rankSignals, RankedSignal, MarketRegime } from '@/lib/signalEngine';

interface Props { lang: Lang; }

function regimeMeta(r: MarketRegime) {
  switch (r) {
    case 'RISK_ON':   return { label: 'RISK-ON',   cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' };
    case 'RISK_OFF':  return { label: 'RISK-OFF',  cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' };
    case 'DEFENSIVE': return { label: 'DEFENSIVE', cls: 'bg-destructive/15 text-destructive border-destructive/30' };
    case 'NEUTRAL':   return { label: 'NEUTRAL',   cls: 'bg-muted text-muted-foreground border-border' };
  }
}

function impactDot(i: RankedSignal['impact']) {
  return i === 'high' ? 'bg-destructive' : i === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground';
}

function typeIcon(t: RankedSignal['type']) {
  return t === 'market' ? BarChart3 : t === 'portfolio' ? ShieldCheck : Coins;
}

function horizonLabel(h: RankedSignal['horizon']) {
  return h === 'short' ? 'Krátky' : h === 'mid' ? 'Stredný' : 'Dlhý';
}

export function TopSignals({ lang }: Props) {
  const { data: prices } = usePrices();
  const { data: athData } = useAthData();
  const { data: fearGreed } = useFearGreed();
  const { data: altSeason } = useAltSeason();
  const { data: advanced } = useAdvancedMarket();
  const { data: apys } = useDefiApys();
  const cycle = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });

  const { regime, regimeReason, signals, threshold } = rankSignals({
    prices, athData, cycle, advanced, apys,
  });

  const r = regimeMeta(regime);

  return (
    <div className="glass-card p-3 space-y-2 border-primary/30">
      <div className="flex items-center gap-1.5">
        <Crosshair className="w-3.5 h-3.5 text-primary" />
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
          Signal Engine
        </h2>
        <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border ${r.cls}`}>
          {r.label}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">{regimeReason}</p>

      {signals.length === 0 ? (
        <div className="rounded-md border border-border bg-secondary/30 p-3 text-center">
          <p className="text-sm font-bold text-muted-foreground">NO SIGNAL</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Žiadny signál neprekročil prah {threshold}/100. Nerob nič — čakaj.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {signals.map((s) => {
            const TypeIcon = typeIcon(s.type);
            return (
              <div key={s.id} className="rounded-md border border-border bg-secondary/30 p-2.5">
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${impactDot(s.impact)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <TypeIcon className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        {s.type}
                      </span>
                      <span className="ml-auto text-[10px] font-bold text-primary">
                        {s.score}/100
                      </span>
                    </div>
                    <p className="text-sm font-bold text-foreground mt-0.5 leading-snug">
                      {s.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {s.reason}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Target className="w-3 h-3" /> {s.confidence}%
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" /> {horizonLabel(s.horizon)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Zap className="w-3 h-3" /> {s.impact}
                      </span>
                    </div>
                    <p className="text-[10px] text-emerald-500 mt-1 leading-snug">
                      → {s.expectedEffect}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
