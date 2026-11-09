import { useMemo, useState } from 'react';
import { Activity, Award, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useEngineParams, useLearningOutcomes } from '@/hooks/useEngineParams';
import { supabase } from '@/integrations/supabase/client';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

function gradeFromReward(avgReward: number): Grade {
  if (avgReward >= 40) return 'A';
  if (avgReward >= 20) return 'B';
  if (avgReward >= 0) return 'C';
  if (avgReward >= -20) return 'D';
  return 'F';
}

function gradeTone(g: Grade): { bg: string; text: string } {
  switch (g) {
    case 'A': return { bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-300' };
    case 'B': return { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300' };
    case 'C': return { bg: 'bg-amber-500/15 border-amber-500/40',    text: 'text-amber-300' };
    case 'D': return { bg: 'bg-rose-500/10 border-rose-500/30',     text: 'text-rose-300' };
    case 'F': return { bg: 'bg-rose-500/20 border-rose-500/50',     text: 'text-rose-200' };
  }
}

export function ExecutionAdvisorCard() {
  const { data: params, refetch: refetchParams } = useEngineParams();
  const { data: outcomes, refetch: refetchOutcomes } = useLearningOutcomes(8);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const list = outcomes ?? [];
    if (!list.length) return { alpha: 0, avgReward: 0, fillRate: 0, n: 0 };
    const avgReward = list.reduce((s, o) => s + (o.reward_score ?? 0), 0) / list.length;
    // Alpha proxy: priemerná 7D zmena ceny po našom nákupe.
    // Záporná zmena = nakúpili sme nad lokálnou cenou (negatívna alfa).
    const alpha = -list.reduce((s, o) => s + (o.avg_price_delta_7d ?? 0), 0) / list.length;
    const fillRate = list.reduce((s, o) => s + (o.avg_fill_rate ?? 0), 0) / list.length;
    return { alpha, avgReward, fillRate, n: list.length };
  }, [outcomes]);

  const grade: Grade = gradeFromReward(stats.avgReward);
  const tone = gradeTone(grade);
  const negativeAlpha = stats.alpha < 0;
  const lowGrade = grade === 'D' || grade === 'F';
  const needsTune = (negativeAlpha || lowGrade) && stats.n >= 2;

  const suggestion = useMemo(() => {
    if (!needsTune) return null;
    // Heuristika: ak je fill-rate nízky → uvoľni limit distance; ak vysoký a alfa nízka → priťahuj market %.
    if (stats.fillRate < 50) {
      return {
        title: 'Zvýš citlivosť limitov o +1.5 %',
        detail: 'Fill-rate je nízky a alfa negatívna — limit ordery nestíhajú vyplniť. Zúžime distance.',
        action: 'tighten_limits' as const,
      };
    }
    return {
      title: 'Posuň Market podiel o +5 %',
      detail: 'Cena po 7D rastie nad naše nákupy — váhujme okamžitý market fill.',
      action: 'boost_market' as const,
    };
  }, [needsTune, stats.fillRate]);

  const apply = async () => {
    if (!suggestion || !params) return;
    setBusy(true);
    try {
      const patch: Record<string, number> = {};
      if (suggestion.action === 'tighten_limits') {
        patch.base_distance_low = Math.max(0.1, Number(params.base_distance_low) - 1.5);
        patch.base_distance_high = Math.max(0.2, Number(params.base_distance_high) - 1.5);
      } else {
        patch.base_market_high = Math.min(95, Number(params.base_market_high) + 5);
        patch.base_market_low = Math.min(90, Number(params.base_market_low) + 5);
      }
      const { error } = await supabase
        .from('engine_params')
        .update({ ...patch, last_change_log: [
          ...(Array.isArray(params.last_change_log) ? params.last_change_log : []).slice(-4),
          ...Object.entries(patch).map(([k, v]) => ({
            param: k,
            from: Number((params as unknown as Record<string, unknown>)[k] ?? 0),
            to: v,
            reason: `Active Advisor · ${suggestion.title}`,
          })),
        ] })
        .eq('id', 1);
      if (error) throw error;
      toast.success('Návrh aplikovaný · parametre engine zaktualizované');
      await Promise.all([refetchParams(), refetchOutcomes()]);
    } catch (e) {
      toast.error(`Chyba: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  const AlphaIcon = stats.alpha >= 0 ? TrendingUp : TrendingDown;
  const alphaColor = stats.alpha >= 0 ? 'text-emerald-300' : 'text-rose-300';

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Award className="w-4 h-4 text-primary flex-shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">
            Execution Performance & Active Advisor
          </h2>
        </div>
        <span className="text-[9px] text-muted-foreground tabular-nums">
          n={stats.n} týž.
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary/60 rounded-lg p-2.5 text-center">
          <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Alpha vs Market DCA</p>
          <p className={`text-xl font-bold tabular-nums flex items-center justify-center gap-1 ${alphaColor}`}>
            <AlphaIcon className="w-4 h-4" />
            {stats.alpha >= 0 ? '+' : ''}{stats.alpha.toFixed(2)}%
          </p>
        </div>
        <div className={`rounded-lg p-2.5 text-center border ${tone.bg}`}>
          <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Efficiency Grade</p>
          <p className={`text-3xl font-extrabold leading-none ${tone.text}`}>{grade}</p>
        </div>
        <div className="bg-secondary/60 rounded-lg p-2.5 text-center">
          <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Ø Reward</p>
          <p className="text-xl font-bold tabular-nums text-foreground flex items-center justify-center gap-1">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            {stats.avgReward >= 0 ? '+' : ''}{stats.avgReward.toFixed(0)}
          </p>
        </div>
      </div>

      {suggestion ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-primary font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Active Advisor návrh
          </div>
          <p className="text-xs font-bold text-foreground">{suggestion.title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">{suggestion.detail}</p>
          <button
            onClick={apply}
            disabled={busy}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            APPLY SUGGESTION
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
          <p className="text-[11px] text-emerald-200 leading-snug">
            ✓ Engine beží v zelenom pásme — žiadne úpravy nie sú potrebné.
          </p>
        </div>
      )}

      <p className="text-[9px] text-muted-foreground leading-snug">
        Alpha = priemerná 7-dňová cena − naša priemerná vstupná. Grade vychádza z reward skóre Self-Learning enginu.
      </p>
    </div>
  );
}
