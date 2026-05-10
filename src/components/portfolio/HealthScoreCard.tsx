import { useMemo, useState } from 'react';
import { Activity, ChevronDown, Info } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

export function HealthScoreCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { metrics, totalStakedValue } = usePortfolio();
  const [open, setOpen] = useState(false);

  const score = useMemo(() => {
    if (metrics.totalValue <= 0) return null;

    const totalDriftPp = metrics.assets.reduce((s, a) => s + Math.abs(a.deviationPct), 0);
    const allocScore = Math.max(0, 40 - totalDriftPp * 2);

    const present = metrics.assets.filter(a => a.actualPct > 0.01).length;
    const divScore = present === 3 ? 20 : present === 2 ? 12 : 5;

    const stakedRatio = metrics.totalValue > 0 ? totalStakedValue / metrics.totalValue : 0;
    const stakeScore = stakedRatio >= 0.3 && stakedRatio <= 0.6
      ? 20
      : stakedRatio < 0.3
        ? Math.round((stakedRatio / 0.3) * 20)
        : Math.max(5, Math.round(20 - (stakedRatio - 0.6) * 30));

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
      present,
      pnlPct,
    };
  }, [metrics, totalStakedValue]);

  if (!score) return null;

  const grade = score.total >= 85 ? { label: sk ? 'Výborné' : 'Excellent', color: 'hsl(var(--gain))' }
    : score.total >= 65 ? { label: sk ? 'Dobré' : 'Good', color: 'hsl(var(--primary))' }
    : score.total >= 45 ? { label: sk ? 'Priemerné' : 'Average', color: '#eab308' }
    : { label: sk ? 'Slabé' : 'Poor', color: 'hsl(var(--loss))' };

  const indicators = [
    {
      key: 'alloc',
      label: sk ? 'Odchýlka alokácie' : 'Allocation drift',
      value: score.parts.allocScore,
      max: 40,
      weight: '40%',
      detail: sk
        ? `Súčet absolútnych odchýliek od cieľa 64/25/11 je ${score.drift.toFixed(1)}pp. Čím bližšie k cieľu, tým vyššie skóre. Pri 0pp = 40 bodov, pri 20pp = 0.`
        : `Sum of absolute deviations from 64/25/11 target is ${score.drift.toFixed(1)}pp. Lower drift = higher score. 0pp = 40, 20pp = 0.`,
      hint: sk ? 'Riešenie: rebalancuj cez DCA do podvážených aktív.' : 'Fix: DCA into underweight assets.',
    },
    {
      key: 'div',
      label: sk ? 'Diverzifikácia' : 'Diversification',
      value: score.parts.divScore,
      max: 20,
      weight: '20%',
      detail: sk
        ? `Držíš ${score.present}/3 aktív (BTC, ETH, SOL) nad 1 % portfólia. 3 = 20 bodov, 2 = 12, 1 = 5.`
        : `You hold ${score.present}/3 assets (BTC, ETH, SOL) above 1 %. 3 = 20, 2 = 12, 1 = 5.`,
      hint: sk ? 'Riešenie: doplň chýbajúce aktívum cez DCA.' : 'Fix: add the missing asset via DCA.',
    },
    {
      key: 'stake',
      label: sk ? 'Pomer stakingu' : 'Stake ratio',
      value: score.parts.stakeScore,
      max: 20,
      weight: '20%',
      detail: sk
        ? `Aktuálne ${(score.stakedRatio * 100).toFixed(0)} % portfólia je v stakingu/lendingu. Ideál 30–60 % = 20 bodov. Menej = nedostatočný výnos, viac = nižšia likvidita.`
        : `${(score.stakedRatio * 100).toFixed(0)} % of portfolio is staked/lent. Sweet spot 30–60 % = 20 points.`,
      hint: sk ? 'Riešenie: uprav holdings stratégiu v Nastaveniach.' : 'Fix: adjust holdings strategy in Settings.',
    },
    {
      key: 'pnl',
      label: sk ? 'P/L drawdown' : 'P/L drawdown',
      value: score.parts.ddScore,
      max: 20,
      weight: '20%',
      detail: sk
        ? `Aktuálny P/L portfólia je ${score.pnlPct >= 0 ? '+' : ''}${score.pnlPct.toFixed(1)} %. Pri ≥0 % = 20 bodov, pri −50 % = 0. Chráni pred prílišným optimizmom v strate.`
        : `Current portfolio P/L is ${score.pnlPct >= 0 ? '+' : ''}${score.pnlPct.toFixed(1)} %. ≥0 % = 20, −50 % = 0.`,
      hint: sk ? 'Riešenie: drawdown nad 30 % = zvážiť pauzu DCA / hľadanie dna.' : 'Fix: DD >30 % = pause DCA / wait for bottom.',
    },
  ];

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
          { k: 'P/L', v: score.parts.ddScore, max: 20 },
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

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors pt-1 border-t border-border"
      >
        <Info className="w-3 h-3" />
        {open ? (sk ? 'Skryť detail' : 'Hide detail') : (sk ? 'Z čoho sa skóre počíta?' : 'How is the score calculated?')}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] text-muted-foreground">
            {sk
              ? 'Skóre 0–100 hodnotí 4 indikátory. Pomáha rýchlo zistiť, či tvoje portfólio drží stratégiu (alokácia 64/25/11, spot-only, akumulácia 1 BTC).'
              : 'Score 0–100 evaluates 4 indicators against your strategy (64/25/11 allocation, spot-only, 1 BTC goal).'}
          </p>
          {indicators.map(i => {
            const pct = (i.value / i.max) * 100;
            const color = pct >= 80 ? 'hsl(var(--gain))' : pct >= 50 ? 'hsl(var(--primary))' : pct >= 25 ? '#eab308' : 'hsl(var(--loss))';
            return (
              <div key={i.key} className="rounded-md bg-secondary/30 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{i.label}</span>
                  <span className="text-[10px] tabular-nums" style={{ color }}>
                    {i.value}/{i.max} · váha {i.weight}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{i.detail}</p>
                <p className="text-[10px] text-primary/80">{i.hint}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
