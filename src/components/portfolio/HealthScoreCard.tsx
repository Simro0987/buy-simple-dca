import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

export function HealthScoreCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { metrics, breakdown, totalStakedValue } = usePortfolio();

  const score = useMemo(() => {
    if (metrics.totalValue <= 0) return null;

    // 1) Allocation drift: 0..40 (lower drift = more)
    const totalDriftPp = metrics.assets.reduce((s, a) => s + Math.abs(a.deviationPct), 0);
    const allocScore = Math.max(0, 40 - totalDriftPp * 2); // 20pp drift => 0

    // 2) Diversification: presence of all 3 assets above 1%
    const present = metrics.assets.filter(a => a.actualPct > 0.01).length;
    const divScore = present === 3 ? 20 : present === 2 ? 12 : 5;

    // 3) Stake ratio: ideal 30-60% staked
    const stakedRatio = metrics.totalValue > 0 ? totalStakedValue / metrics.totalValue : 0;
    const stakeScore = stakedRatio >= 0.3 && stakedRatio <= 0.6
      ? 20
      : stakedRatio < 0.3
        ? Math.round((stakedRatio / 0.3) * 20)
        : Math.max(5, Math.round(20 - (stakedRatio - 0.6) * 30));

    // 4) Drawdown: based on totalPnlPct (-50% drawdown => 0)
    const pnlPct = metrics.totalPnlPct;
    const ddScore = pnlPct >= 0
      ? 20
      : Math.max(0, Math.round(20 + (pnlPct / 50) * 20));

    const total = Math.round(allocScore + divScore + stakeScore + ddScore);
    return {
      total: Math.min(100, total),
      parts: { allocScore, divScore, stakeScore, ddScore },
      drift: totalDriftPp,
      stakedRatio,
    };
  }, [metrics, totalStakedValue]);

  if (!score) return null;

  const grade = score.total >= 85 ? { label: sk ? 'Výborné' : 'Excellent', color: 'hsl(var(--gain))' }
    : score.total >= 65 ? { label: sk ? 'Dobré' : 'Good', color: 'hsl(var(--primary))' }
    : score.total >= 45 ? { label: sk ? 'Priemerné' : 'Average', color: '#eab308' }
    : { label: sk ? 'Slabé' : 'Poor', color: 'hsl(var(--loss))' };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Zdravie portfólia' : 'Portfolio Health'}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold tabular-nums" style={{ color: grade.color }}>
            {score.total}
          </span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>

      <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score.total}%`, background: grade.color }} />
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { k: 'Alok.', v: score.parts.allocScore, max: 40 },
          { k: sk ? 'Diverz.' : 'Div.', v: score.parts.divScore, max: 20 },
          { k: 'Stake', v: score.parts.stakeScore, max: 20 },
          { k: sk ? 'P/L' : 'P/L', v: score.parts.ddScore, max: 20 },
        ].map(p => (
          <div key={p.k} className="bg-secondary/40 rounded-md py-1.5">
            <p className="text-[9px] text-muted-foreground">{p.k}</p>
            <p className="text-xs font-bold text-foreground tabular-nums">{p.v}<span className="text-muted-foreground text-[9px]">/{p.max}</span></p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-center" style={{ color: grade.color }}>
        {grade.label} · {sk ? 'Odchýlka' : 'Drift'} {score.drift.toFixed(1)}pp · Stake {(score.stakedRatio * 100).toFixed(0)}%
      </p>
    </div>
  );
}
