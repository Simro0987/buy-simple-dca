import { useEffect, useState } from 'react';
import { Brain, ChevronDown, ChevronUp, RefreshCw, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { useEngineParams, useLearningOutcomes } from '@/hooks/useEngineParams';
import { setAdaptiveOverrides } from '@/lib/dynamicExecution';
import { supabase } from '@/integrations/supabase/client';

export function LearningEngineCard() {
  const { data: params, refetch: refetchParams, isFetching } = useEngineParams();
  const { data: outcomes, refetch: refetchOutcomes } = useLearningOutcomes(5);
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);

  // Apply overrides na engine každý raz keď sa params zmenia
  useEffect(() => {
    if (params) {
      setAdaptiveOverrides({
        baseMarketHigh: Number(params.base_market_high),
        baseMarketLow: Number(params.base_market_low),
        baseDistanceLow: Number(params.base_distance_low),
        baseDistanceHigh: Number(params.base_distance_high),
        volatilitySensitivity: Number(params.volatility_sensitivity),
        momentumSensitivity: Number(params.momentum_sensitivity),
      });
    }
  }, [params]);

  const runTick = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('learning-engine-tick');
      if (error) throw error;
      if (data?.skipped) {
        toast.info(`Engine tick: ${data.skipped}`);
      } else {
        toast.success(`Engine tick · reward ${data?.reward ?? '–'} · ${data?.changes?.length ?? 0} úprav`);
      }
      await Promise.all([refetchParams(), refetchOutcomes()]);
    } catch (e) {
      toast.error(`Chyba: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setRunning(false);
    }
  };

  if (!params) {
    return (
      <div className="glass-card p-4">
        <p className="text-xs text-muted-foreground">Načítavam adaptívny engine…</p>
      </div>
    );
  }

  const lastReward = params.last_reward;
  const rewardColor = lastReward == null ? 'text-muted-foreground'
    : lastReward > 20 ? 'text-emerald-400'
    : lastReward < -20 ? 'text-rose-400'
    : 'text-amber-400';
  const rewardLabel = lastReward == null ? '—'
    : lastReward > 0 ? `+${lastReward}` : `${lastReward}`;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">Self-Learning Engine</h2>
            <p className="text-[10px] text-muted-foreground">
              Iterácia #{params.iteration} · {params.enabled ? 'aktívny' : 'pauznutý'}
            </p>
          </div>
        </div>
        <button
          onClick={runTick}
          disabled={running || isFetching}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary text-xs font-medium active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${running ? 'animate-spin' : ''}`} />
          Tick
        </button>
      </div>

      {/* Posledná odmena */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary/60 rounded-lg p-2 text-center">
          <p className="text-[9px] uppercase text-muted-foreground">Posl. reward</p>
          <p className={`text-lg font-bold tabular-nums ${rewardColor}`}>{rewardLabel}</p>
        </div>
        <div className="bg-secondary/60 rounded-lg p-2 text-center">
          <p className="text-[9px] uppercase text-muted-foreground">Vyhodnotení</p>
          <p className="text-lg font-bold tabular-nums text-foreground">{outcomes?.length ?? 0}</p>
        </div>
        <div className="bg-secondary/60 rounded-lg p-2 text-center">
          <p className="text-[9px] uppercase text-muted-foreground">Max krok</p>
          <p className="text-lg font-bold tabular-nums text-foreground">±{params.max_step_pct}%</p>
        </div>
      </div>

      {/* Aktuálne adaptívne parametre */}
      <div className="bg-secondary/40 rounded-lg p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Aktuálne parametre</p>
        <Row label="Base Market % (score 0 → 100)" value={`${Number(params.base_market_high).toFixed(1)}% → ${Number(params.base_market_low).toFixed(1)}%`} />
        <Row label="Base Distance % (score 0 → 100)" value={`${Number(params.base_distance_low).toFixed(2)}% → ${Number(params.base_distance_high).toFixed(2)}%`} />
        <Row label="Citlivosť na volatilitu" value={Number(params.volatility_sensitivity).toFixed(2)} />
        <Row label="Citlivosť na momentum" value={Number(params.momentum_sensitivity).toFixed(2)} />
      </div>

      {/* Posledné zmeny */}
      {Array.isArray(params.last_change_log) && params.last_change_log.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Posledné úpravy</p>
          {params.last_change_log.map((c, i) => (
            <div key={i} className="text-[11px] leading-tight">
              <p className="text-foreground">
                <span className="font-mono text-[10px] text-muted-foreground">{c.param}</span>{' '}
                <span className="tabular-nums">{Number(c.from).toFixed(2)} → {Number(c.to).toFixed(2)}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">{c.reason}</p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setExpanded(s => !s)}
        className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>História výkonu ({outcomes?.length ?? 0})</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && outcomes && outcomes.length > 0 && (
        <div className="space-y-2">
          {outcomes.map(o => {
            const r = o.reward_score ?? 0;
            const RewardIcon = r > 0 ? TrendingUp : r < 0 ? TrendingDown : Activity;
            const rColor = r > 20 ? 'text-emerald-400' : r < -20 ? 'text-rose-400' : 'text-amber-400';
            return (
              <div key={o.id} className="bg-secondary/40 rounded-lg p-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-foreground">Týždeň #{o.week_number}</p>
                  <div className={`flex items-center gap-1 ${rColor}`}>
                    <RewardIcon className="w-3 h-3" />
                    <span className="font-bold tabular-nums">{r > 0 ? '+' : ''}{r}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground tabular-nums">
                  <span>Δ ceny 7d: <span className={`font-semibold ${(o.avg_price_delta_7d ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(o.avg_price_delta_7d ?? 0) > 0 ? '+' : ''}{Number(o.avg_price_delta_7d ?? 0).toFixed(2)}%
                  </span></span>
                  <span>Fill rate: <span className="font-semibold text-foreground">{Number(o.avg_fill_rate ?? 0).toFixed(0)}%</span></span>
                </div>
                {o.notes && <p className="text-[10px] text-muted-foreground mt-1 italic">{o.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Engine sa automaticky učí každý pondelok 06:00. Vyhodnotí cenu po 7 dňoch a fill-rate limit orderov,
        potom posunie parametre o max ±{params.max_step_pct}% správnym smerom.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}
