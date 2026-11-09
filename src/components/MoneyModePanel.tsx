import { useMemo, useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus, Wallet, Target, AlertTriangle, CheckCircle2, Settings, RotateCcw, Sparkles } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { formatUsd, type PriceData } from '@/lib/crypto';
import {
  buildMoneyModeReport,
  loadAutoTuneEnabled,
  saveAutoTuneEnabled,
  loadTuning,
  applyTuning,
  resetTuning,
  DEFAULT_TUNING,
  type TuningParams,
} from '@/lib/moneyMode';
import type { HistoryEntry } from '@/lib/mondayController';

interface Props {
  history: HistoryEntry[];
  prices?: PriceData;
  onTuningChange: (t: TuningParams) => void;
}

export function MoneyModePanel({ history, prices, onTuningChange }: Props) {
  const [autoTune, setAutoTune] = useState(loadAutoTuneEnabled);
  const [tuning, setTuning] = useState<TuningParams>(loadTuning);
  const [showSettings, setShowSettings] = useState(false);

  const report = useMemo(() => buildMoneyModeReport(history, prices), [history, prices]);

  const statusStyle = report.status === 'winning'
    ? { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'WINNING', icon: Trophy }
    : report.status === 'losing'
    ? { bg: 'bg-rose-500/15',    text: 'text-rose-400',    border: 'border-rose-500/30',    label: 'LOSING',  icon: TrendingDown }
    : { bg: 'bg-secondary',      text: 'text-foreground',  border: 'border-border',         label: 'NEUTRAL', icon: Minus };

  const StatusIcon = statusStyle.icon;

  const handleApplyProposed = () => {
    if (!report.proposedTuning) return;
    const safe = applyTuning(report.proposedTuning);
    setTuning(safe);
    onTuningChange(safe);
  };

  const handleResetTuning = () => {
    const safe = resetTuning();
    setTuning(safe);
    onTuningChange(safe);
  };

  const handleAutoTuneToggle = () => {
    const next = !autoTune;
    setAutoTune(next);
    saveAutoTuneEnabled(next);
  };

  const chartData = report.weeks.map(w => ({
    date: w.date.slice(5),
    Plain: Math.round(w.plainTotalValueUsd),
    Smart: Math.round(w.smartTotalValueUsd),
  }));

  if (history.length === 0) {
    return (
      <div className="glass-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Money Mode</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ulož aspoň 1 týždeň do histórie a Money Mode začne porovnávať Smart DCA vs Plain DCA, sledovať drawdown, cash drag a navrhne kalibrácie každých 12 týždňov.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <h2 className="text-sm font-bold text-foreground">Money Mode</h2>
          <span className="text-[10px] text-muted-foreground">· {history.length}t</span>
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          className="p-1.5 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
          title="Nastavenia tuningu"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* STATUS */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg ${statusStyle.bg} border ${statusStyle.border}`}>
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={`w-4 h-4 ${statusStyle.text} flex-shrink-0`} />
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Smart vs Plain DCA</p>
            <p className={`text-base font-bold tracking-wide ${statusStyle.text}`}>{statusStyle.label}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-muted-foreground">Rozdiel</p>
          <p className={`text-lg font-bold tabular-nums ${report.returnDiffPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {report.returnDiffPct >= 0 ? '+' : ''}{report.returnDiffPct.toFixed(2)} pp
          </p>
        </div>
      </div>

      {/* HEAD-TO-HEAD CARDS */}
      <div className="grid grid-cols-2 gap-2">
        <StrategyCard
          title="Plain DCA"
          subtitle="100 % každý týždeň"
          totalUsd={report.plainTotalUsd}
          contribUsd={report.totalContributions}
          returnPct={report.plainReturnPct}
          drawdownPct={report.plainMaxDrawdownPct}
          volatilityPct={report.plainVolatilityPct}
          sharpe={report.plainSharpeLite}
          accent="text-foreground"
        />
        <StrategyCard
          title="Smart DCA"
          subtitle={`Ø ${report.averageSmartDeploymentPct.toFixed(0)} % nasadené`}
          totalUsd={report.smartTotalUsd}
          contribUsd={report.totalContributions}
          returnPct={report.smartReturnPct}
          drawdownPct={report.smartMaxDrawdownPct}
          volatilityPct={report.smartVolatilityPct}
          sharpe={report.smartSharpeLite}
          accent="text-primary"
          highlighted
        />
      </div>

      {/* SCORECARD METRICS */}
      <div className="grid grid-cols-3 gap-1.5">
        <MetricChip
          label="Drawdown saved"
          value={`${report.drawdownSavedPct >= 0 ? '+' : ''}${report.drawdownSavedPct.toFixed(1)}%`}
          good={report.drawdownSavedPct >= 0}
          icon={Target}
        />
        <MetricChip
          label="Lepšie BTC entry"
          value={`${report.averageEntryImprovementPct >= 0 ? '+' : ''}${report.averageEntryImprovementPct.toFixed(1)}%`}
          good={report.averageEntryImprovementPct >= 0}
          icon={TrendingDown}
        />
        <MetricChip
          label="Cash drag"
          value={`${report.cashDragPct.toFixed(0)}%`}
          good={report.cashDragPct < 25}
          warn={report.cashDragPct > 35}
          icon={Wallet}
        />
        <MetricChip
          label="Nasadený kapitál"
          value={`${report.capitalDeployedPct.toFixed(0)}%`}
          good={report.capitalDeployedPct > 75}
          icon={Wallet}
        />
        <MetricChip
          label="Buy-the-dip"
          value={`${report.buyTheDipScore.toFixed(0)}/100`}
          good={report.buyTheDipScore >= 55}
          icon={TrendingDown}
        />
        <MetricChip
          label="Týždne W/L"
          value={`${report.weeksWon}/${report.weeksLost}`}
          good={report.weeksWon >= report.weeksLost}
          icon={Trophy}
        />
      </div>

      {/* RECOMMENDATIONS */}
      {report.recommendations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Odporúčania</p>
          {report.recommendations.map((r, i) => {
            const style = r.level === 'good' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              : r.level === 'warn' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              : 'bg-secondary text-muted-foreground border-border';
            const Icon = r.level === 'good' ? CheckCircle2 : r.level === 'warn' ? AlertTriangle : Minus;
            return (
              <div key={i} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border ${style}`}>
                <Icon className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] leading-relaxed">{r.text}</p>
              </div>
            );
          })}
          {report.proposedTuning && (
            <button
              onClick={handleApplyProposed}
              disabled={!autoTune}
              className="w-full mt-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {autoTune ? 'Aplikovať navrhnuté zmeny' : 'Auto-tuning vypnutý'}
            </button>
          )}
        </div>
      )}

      {/* CHART */}
      {chartData.length >= 2 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
            Posledných {Math.min(chartData.length, 12)} týždňov · hodnota portfólia
          </p>
          <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.slice(-12)} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={45}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => formatUsd(v)}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="Plain" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Smart" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SETTINGS PANEL */}
      {showSettings && (
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Auto-tuning</p>
              <p className="text-[10px] text-muted-foreground">Úpravy len každých 12 týždňov, v bezpečných medziach.</p>
            </div>
            <button
              onClick={handleAutoTuneToggle}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                autoTune ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {autoTune ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <TuningRow label="Min alokácia" value={`${tuning.minAllocationPct}%`} bounds="22–35" />
            <TuningRow label="Max alokácia" value={`${tuning.maxAllocationPct}%`} bounds="75–85" />
            <TuningRow label="Conf Low" value={`×${tuning.confLowMult.toFixed(2)}`} bounds="0.82–0.90" />
            <TuningRow label="Conf Med" value={`×${tuning.confMedMult.toFixed(2)}`} bounds="0.90–0.96" />
            <TuningRow label="Limit −%" value={`${tuning.limitDiscountDefaultPct}%`} bounds="3–5" />
            <TuningRow label="High-score zníženie" value={`−${tuning.highScoreReducerPct}%`} bounds="0–5" />
            <TuningRow label="MA reclaim bonus" value={`+${tuning.maReclaimBonusPct}%`} bounds="0–5" />
            <TuningRow label="Conf High" value={`×${tuning.confHighMult.toFixed(2)}`} bounds="fixné" />
          </div>

          <button
            onClick={handleResetTuning}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-secondary text-secondary-foreground text-[11px] font-medium"
          >
            <RotateCcw className="w-3 h-3" />
            Reset na default
          </button>

          <p className="text-[9px] text-muted-foreground leading-relaxed">
            Bezpečné limity garantujú, že auto-tuning nemôže zmeniť portfolio weights ani jadrové formuly. Najbližšia revízia: {report.weeksUntilNextReview === 0 ? 'teraz' : `o ${report.weeksUntilNextReview} t`}.
          </p>
        </div>
      )}
    </div>
  );
}

// ----- subcomponents -----

interface StrategyCardProps {
  title: string;
  subtitle: string;
  totalUsd: number;
  contribUsd: number;
  returnPct: number;
  drawdownPct: number;
  volatilityPct: number;
  sharpe: number;
  accent: string;
  highlighted?: boolean;
}

function StrategyCard(p: StrategyCardProps) {
  const positive = p.returnPct >= 0;
  return (
    <div className={`rounded-lg p-3 ${p.highlighted ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/40'}`}>
      <p className={`text-[10px] uppercase tracking-wider font-semibold ${p.accent}`}>{p.title}</p>
      <p className="text-[9px] text-muted-foreground mb-2 leading-tight">{p.subtitle}</p>
      <p className="text-lg font-bold text-foreground tabular-nums leading-tight">{formatUsd(p.totalUsd)}</p>
      <p className={`text-xs font-semibold tabular-nums ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
        {positive ? '+' : ''}{p.returnPct.toFixed(2)}%
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[9px]">
        <div>
          <p className="text-muted-foreground">DD</p>
          <p className="font-semibold text-foreground tabular-nums">{p.drawdownPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Vol</p>
          <p className="font-semibold text-foreground tabular-nums">{p.volatilityPct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Sharpe</p>
          <p className="font-semibold text-foreground tabular-nums">{p.sharpe.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

interface MetricChipProps {
  label: string;
  value: string;
  good?: boolean;
  warn?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

function MetricChip({ label, value, good, warn, icon: Icon }: MetricChipProps) {
  const style = warn ? 'bg-rose-500/10 text-rose-300'
    : good ? 'bg-emerald-500/10 text-emerald-300'
    : 'bg-secondary text-foreground';
  return (
    <div className={`rounded-md p-1.5 ${style}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-2.5 h-2.5 opacity-80" />
        <p className="text-[9px] uppercase tracking-tight truncate">{label}</p>
      </div>
      <p className="text-xs font-bold tabular-nums leading-tight">{value}</p>
    </div>
  );
}

function TuningRow({ label, value, bounds }: { label: string; value: string; bounds: string }) {
  return (
    <div className="bg-secondary/40 rounded p-1.5">
      <p className="text-muted-foreground truncate">{label}</p>
      <p className="text-foreground font-semibold tabular-nums">{value}</p>
      <p className="text-[8px] text-muted-foreground tabular-nums">{bounds}</p>
    </div>
  );
}

// Re-export for callers that want direct access to the defaults type.
export { DEFAULT_TUNING };
export type { TuningParams };
