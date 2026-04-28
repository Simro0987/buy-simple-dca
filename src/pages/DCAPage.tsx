import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Download, Trash2, Info, ChevronDown, ChevronUp, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Sparkles, X, Zap, BarChart3, Heart, Activity as ActivityIcon } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { MoneyModePanel } from '@/components/MoneyModePanel';
import { CapitalInputCard } from '@/components/dca/CapitalInputCard';
import { FactorOverrideCard } from '@/components/dca/FactorOverrideCard';
import { RegimeOverrideCard } from '@/components/dca/RegimeOverrideCard';
import { BreakdownTable } from '@/components/dca/BreakdownTable';
import { usePrices, useFearGreed } from '@/hooks/usePrices';
import { useBtc200dMA } from '@/hooks/useBtc200dMA';
import { Lang } from '@/lib/i18n';
import { formatUsd, formatPrice, formatQuantity } from '@/lib/crypto';
import {
  buildPlan,
  bandLabel,
  thisMondayIso,
  loadHistory,
  saveHistoryEntry,
  clearHistory,
  exportHistoryCsv,
  type MondayInputs,
  type HistoryEntry,
  type Regime,
  type FactorKey,
} from '@/lib/mondayController';
import { loadTuning, type TuningParams } from '@/lib/moneyMode';
import { toast } from 'sonner';

interface Props { lang: Lang; }

const INPUTS_KEY = 'monday-controller-inputs-v1';

const DEFAULTS: MondayInputs = {
  capital: 500,
  btcPrice: 0,
  btc30dHigh: 0,
  fearGreed: 50,
  btcAbove200dMA: true,
};

function loadInputs(): MondayInputs {
  try {
    const raw = localStorage.getItem(INPUTS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

// Cheap (low score) = green, expensive (high) = red
function scoreColor(score: number): string {
  if (score <= 25) return 'text-emerald-400';
  if (score <= 45) return 'text-emerald-400';
  if (score <= 65) return 'text-foreground';
  if (score <= 80) return 'text-amber-400';
  return 'text-rose-400';
}

function regimeStyle(regime: Regime): { bg: string; text: string; dot: string; border: string } {
  switch (regime) {
    case 'bull':     return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-500/30' };
    case 'bear':     return { bg: 'bg-rose-500/15',    text: 'text-rose-400',    dot: 'bg-rose-400',    border: 'border-rose-500/30' };
    case 'sideways': return { bg: 'bg-secondary',      text: 'text-foreground',  dot: 'bg-foreground/50', border: 'border-border' };
    case 'panic':    return { bg: 'bg-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-300', border: 'border-emerald-500/40' };
    case 'euphoria': return { bg: 'bg-amber-500/20',   text: 'text-amber-300',   dot: 'bg-amber-300',   border: 'border-amber-500/40' };
  }
}

export function DCAPage({ lang: _lang }: Props) {
  const [inputs, setInputs] = useState<MondayInputs>(loadInputs);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showWhy, setShowWhy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showRitual, setShowRitual] = useState(false);

  const { data: prices, refetch: refetchPrices, isFetching: pricesLoading } = usePrices();
  const { data: fg, refetch: refetchFg, isFetching: fgLoading } = useFearGreed();
  const { data: ma200, refetch: refetchMa, isFetching: maLoading, isError: maError } = useBtc200dMA();

  // Auto-fill from APIs (live BTC price → fills BTC + 30D high if blank, F&G if untouched).
  // Always feeds the regime engine: 200D/50D, 30D high distance, 30D momentum, 30D vol, 7D, 24h alts.
  useEffect(() => {
    setInputs(prev => {
      const next = { ...prev };
      let changed = false;
      const livePrice = prices?.bitcoin?.usd;
      if (livePrice && (!prev.btcPrice || prev.btcPrice === 0)) {
        next.btcPrice = Math.round(livePrice);
        changed = true;
      }
      if (typeof fg?.value === 'number' && prev.fearGreed === DEFAULTS.fearGreed) {
        next.fearGreed = fg.value;
        changed = true;
      }
      if (ma200) {
        if (prev.btcAbove200dMA !== ma200.above)                             { next.btcAbove200dMA = ma200.above;                  changed = true; }
        if (prev.btcMa50AboveMa200 !== ma200.ma50AboveMa200)                  { next.btcMa50AboveMa200 = ma200.ma50AboveMa200;     changed = true; }
        if (prev.btc7dChangePct !== ma200.change7dPct)                        { next.btc7dChangePct = ma200.change7dPct;           changed = true; }
        if (prev.btc30dChangePct !== ma200.change30dPct)                      { next.btc30dChangePct = ma200.change30dPct;         changed = true; }
        if (prev.btcDistanceFrom30dHighPct !== ma200.distanceFrom30dHighPct)  { next.btcDistanceFrom30dHighPct = ma200.distanceFrom30dHighPct; changed = true; }
        if (prev.btcVolatility30dPct !== ma200.volatility30dPct)              { next.btcVolatility30dPct = ma200.volatility30dPct; changed = true; }
        // Use the actual 30D high derived from candles if user hasn't typed one in.
        if ((!prev.btc30dHigh || prev.btc30dHigh === 0) && ma200.high30d > 0) { next.btc30dHigh = Math.round(ma200.high30d);       changed = true; }
      }
      const ethCh = prices?.ethereum?.usd_24h_change;
      const solCh = prices?.solana?.usd_24h_change;
      const btcCh = prices?.bitcoin?.usd_24h_change;
      if (typeof ethCh === 'number' && prev.eth24hChangePct !== ethCh) { next.eth24hChangePct = ethCh; changed = true; }
      if (typeof solCh === 'number' && prev.sol24hChangePct !== solCh) { next.sol24hChangePct = solCh; changed = true; }
      if (typeof btcCh === 'number' && prev.btc24hChangePct !== btcCh) { next.btc24hChangePct = btcCh; changed = true; }
      return changed ? next : prev;
    });
  }, [prices, fg, ma200]);

  useEffect(() => {
    localStorage.setItem(INPUTS_KEY, JSON.stringify(inputs));
  }, [inputs]);

  const prevDeploymentPct = history[0]?.plan.deploymentPct;
  const [tuning, setTuning] = useState<TuningParams>(loadTuning);
  const [factorOverrides, setFactorOverrides] = useState<Partial<Record<FactorKey, number>>>({});
  const [regimeOverride, setRegimeOverride] = useState<Regime | 'auto'>('auto');
  // MA reclaim = previous saved week was below 200D, current input is above.
  const maReclaimActive = useMemo(
    () => inputs.btcAbove200dMA === true && history[0]?.inputs.btcAbove200dMA === false,
    [inputs.btcAbove200dMA, history],
  );
  const plan = useMemo(
    () => buildPlan(inputs, prices, prevDeploymentPct, { ...tuning, maReclaimActive }),
    [inputs, prices, prevDeploymentPct, tuning, maReclaimActive],
  );

  // Apply manual overrides on top of computed factors (visual + score recompute)
  const effectiveFactors = useMemo(
    () => plan.factors.map(f => ({ ...f, score: factorOverrides[f.key] ?? f.score })),
    [plan.factors, factorOverrides],
  );
  const overrideActive =
    Object.keys(factorOverrides).length > 0 || regimeOverride !== 'auto';
  const effectiveScore = useMemo(() => {
    if (!overrideActive) return plan.factorScore;
    const total = effectiveFactors.reduce((s, f) => s + f.weight, 0) || 1;
    return Math.round(effectiveFactors.reduce((s, f) => s + f.score * f.weight, 0) / total);
  }, [effectiveFactors, plan.factorScore, overrideActive]);

  const update = <K extends keyof MondayInputs>(key: K, value: MondayInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: value }));

  const handleAutoFill = async () => {
    await Promise.all([refetchPrices(), refetchFg(), refetchMa()]);
    toast.success('Dáta načítané');
  };

  const handleSaveWeek = () => {
    const entry: HistoryEntry = {
      date: thisMondayIso(),
      inputs,
      plan: {
        valuationScore: plan.factorScore,
        band: plan.band,
        deploymentPct: plan.finalAllocationPct / 100,
        investableUsd: plan.investableUsd,
        reservedUsd: plan.reservedUsd,
        regime: plan.regime,
        confidence: plan.confidence,
      },
    };
    setHistory(saveHistoryEntry(entry));
    toast.success('Týždeň uložený do histórie');
  };

  const handleExportCsv = () => {
    const csv = exportHistoryCsv(history);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monday-controller-history-${thisMondayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    if (!confirm('Vymazať celú históriu?')) return;
    clearHistory();
    setHistory([]);
  };

  const loading = pricesLoading || fgLoading || maLoading;
  const rs = regimeStyle(plan.regime);
  const confStyle = plan.confidence === 'high'
    ? { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'High' }
    : plan.confidence === 'medium'
    ? { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Medium' }
    : { bg: 'bg-rose-500/15', text: 'text-rose-400', label: 'Low' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">Monday DCA Controller</h1>
          <p className="text-xs text-muted-foreground">Adaptívny týždenný alokátor · {thisMondayIso()}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShowRitual(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ritual
          </button>
          <button
            onClick={handleAutoFill}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Auto-fill
          </button>
        </div>
      </div>

      {/* TOP — Regime · Score · Confidence · Allocation */}
      <div className="glass-card p-5">
        <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-4 ${rs.bg} border ${rs.border}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full ${rs.dot} animate-pulse`} />
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Trhový režim</p>
              <p className={`text-sm font-bold tracking-wide ${rs.text}`}>{plan.regimeShort} · {plan.regimeLabel}</p>
            </div>
          </div>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${confStyle.bg} ${confStyle.text}`}
            title={`Zhoda faktorov: ${Math.round(plan.confidenceAgreement * 100)}%`}>
            <ShieldCheck className="w-3 h-3" />
            Confidence {confStyle.label} · ×{plan.confidenceMultiplier.toFixed(2)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Final Score</p>
            <p className={`text-5xl font-bold tabular-nums ${scoreColor(plan.factorScore)}`}>
              {plan.factorScore}
              <span className="text-xl text-muted-foreground font-normal">/100</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">0 = lacný · 100 = drahý</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Alokácia</p>
            <p className="text-4xl font-bold text-foreground tabular-nums">{plan.finalAllocationPct}%</p>
            {plan.confidenceMultiplier < 1 && !plan.overrideTriggered && (
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                base {Math.round(plan.baseAllocationPct)}% × {plan.confidenceMultiplier.toFixed(2)}
              </p>
            )}
            {plan.overrideTriggered === 'panic_floor' && (
              <p className="text-[10px] text-emerald-400 mt-0.5">⚡ Panic floor 85%</p>
            )}
            {plan.overrideTriggered === 'euphoria_ceiling' && (
              <p className="text-[10px] text-amber-400 mt-0.5">🛑 Euphoria cap 20%</p>
            )}
            <p className="text-sm font-semibold text-foreground mt-1">{formatUsd(plan.investableUsd)}</p>
          </div>
        </div>

        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              plan.factorScore <= 45 ? 'bg-emerald-500'
              : plan.factorScore <= 65 ? 'bg-foreground/40'
              : plan.factorScore <= 80 ? 'bg-amber-500'
              : 'bg-rose-500'
            }`}
            style={{ width: `${plan.factorScore}%` }}
          />
        </div>

        {/* 5 FACTOR CARDS — show active regime weights */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">5 faktorov · váhy podľa režimu</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">vážený = {plan.factorScore}</p>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {plan.factors.map(f => {
              const Icon = f.key === 'valuation' ? BarChart3
                : f.key === 'trend' ? TrendingUp
                : f.key === 'sentiment' ? Heart
                : f.key === 'momentum' ? ActivityIcon
                : Zap;
              const color = f.score <= 45 ? 'text-emerald-400 bg-emerald-500/15'
                : f.score <= 65 ? 'text-foreground bg-secondary'
                : f.score <= 80 ? 'text-amber-400 bg-amber-500/15'
                : 'text-rose-400 bg-rose-500/15';
              const barColor = f.score <= 45 ? 'bg-emerald-500'
                : f.score <= 65 ? 'bg-foreground/40'
                : f.score <= 80 ? 'bg-amber-500'
                : 'bg-rose-500';
              return (
                <div key={f.key} className={`rounded-lg p-2 ${color}`} title={`${f.label} · ${f.detail} · váha ${Math.round(f.weight * 100)}%`}>
                  <div className="flex items-center justify-between mb-1">
                    <Icon className="w-3 h-3 opacity-80" />
                    <span className="text-[10px] font-bold tabular-nums">{f.score}</span>
                  </div>
                  <p className="text-[9px] uppercase tracking-tight font-semibold leading-tight truncate">{f.label}</p>
                  <p className="text-[9px] tabular-nums opacity-70 mt-0.5">w {Math.round(f.weight * 100)}%</p>
                  <div className="h-1 bg-background/40 rounded-full overflow-hidden mt-1">
                    <div className={`h-full ${barColor}`} style={{ width: `${f.score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-muted-foreground mt-1.5 leading-relaxed">
            Váhy sa menia dynamicky podľa zisteného režimu (BULL / BEAR / SIDEWAYS / PANIC / EUFÓRIA).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
          <div className="bg-secondary/60 rounded-lg p-2">
            <p className="text-muted-foreground">Hotovosť rezerva</p>
            <p className="font-semibold text-foreground tabular-nums">{formatUsd(plan.reservedUsd)}</p>
          </div>
          <div className="bg-secondary/60 rounded-lg p-2">
            <p className="text-muted-foreground">Týždenný kapitál</p>
            <p className="font-semibold text-foreground tabular-nums">{formatUsd(inputs.capital)}</p>
          </div>
        </div>

        <button
          onClick={() => setShowWhy(s => !s)}
          className="mt-3 w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Prečo táto alokácia?</span>
          {showWhy ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showWhy && (
          <div className="mt-2 space-y-2 bg-secondary/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground leading-relaxed">{plan.rationale}</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Vzorec: Allocation % = 82 − (Score × 0.62), clamp [22 %, 80 %]. Override: Panic + score &lt; 15 → 85 %; Eufória + score &gt; 90 → 20 %. Confidence multiplier: High ×1.00 · Medium ×0.93 · Low ×0.85.
            </p>
          </div>
        )}
      </div>

      {/* MONEY MODE — performance vs Plain DCA + auto-tuning */}
      <MoneyModePanel
        history={history}
        prices={prices}
        onTuningChange={setTuning}
      />

      {/* INPUTS */}
      <div className="glass-card p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vstupy (manuálny override)</h2>
        <NumberInput label="Týždenný kapitál (USD)" value={inputs.capital} onChange={v => update('capital', v)} step={50} />
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="BTC cena" value={inputs.btcPrice} onChange={v => update('btcPrice', v)} step={100} />
          <NumberInput label="BTC 30D high" value={inputs.btc30dHigh} onChange={v => update('btc30dHigh', v)} step={100} />
        </div>
        <NumberInput label="Fear & Greed (0–100)" value={inputs.fearGreed} onChange={v => update('fearGreed', Math.max(0, Math.min(100, v)))} step={1} />
      </div>

      {/* AUTO BTC SIGNALS */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">BTC signály (auto)</h2>
          {ma200 ? (
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              ma200.above ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            }`}>
              {ma200.above ? 'Nad 200D MA ✅' : 'Pod 200D MA ⚠️'}
            </span>
          ) : maError ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Dáta nedostupné
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">Načítavam…</span>
          )}
        </div>
        {ma200 ? (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-secondary/60 rounded-lg p-2">
              <p className="text-[10px] uppercase text-muted-foreground">BTC cena</p>
              <p className="font-semibold text-foreground tabular-nums">{formatPrice(ma200.currentPrice)}</p>
            </div>
            <div className="bg-secondary/60 rounded-lg p-2">
              <p className="text-[10px] uppercase text-muted-foreground">200D / 50D</p>
              <p className="font-semibold text-foreground tabular-nums text-[11px]">
                {formatPrice(ma200.ma200)}<br/>{formatPrice(ma200.ma50)}
              </p>
            </div>
            <div className="bg-secondary/60 rounded-lg p-2">
              <p className="text-[10px] uppercase text-muted-foreground">vs 200D</p>
              <p className={`font-semibold tabular-nums flex items-center gap-1 ${ma200.above ? 'text-emerald-400' : 'text-amber-400'}`}>
                {ma200.above ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {ma200.distancePct >= 0 ? '+' : ''}{ma200.distancePct.toFixed(1)}%
              </p>
            </div>
            <div className="bg-secondary/60 rounded-lg p-2">
              <p className="text-[10px] uppercase text-muted-foreground">30D mom</p>
              <p className={`font-semibold tabular-nums ${ma200.change30dPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {ma200.change30dPct >= 0 ? '+' : ''}{ma200.change30dPct.toFixed(1)}%
              </p>
            </div>
            <div className="bg-secondary/60 rounded-lg p-2">
              <p className="text-[10px] uppercase text-muted-foreground">Od 30D high</p>
              <p className="font-semibold text-foreground tabular-nums">
                {ma200.distanceFrom30dHighPct.toFixed(1)}%
              </p>
            </div>
            <div className="bg-secondary/60 rounded-lg p-2">
              <p className="text-[10px] uppercase text-muted-foreground">30D vol</p>
              <p className="font-semibold text-foreground tabular-nums">
                {ma200.volatility30dPct.toFixed(2)}%
              </p>
            </div>
          </div>
        ) : maError ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Nepodarilo sa načítať denné BTC sviečky. Skús Auto-fill.
          </p>
        ) : (
          <div className="h-12 rounded-lg bg-secondary/40 animate-pulse" />
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          Tieto signály automaticky riadia detekciu režimu (200D/50D, 30D high, 30D momentum, 30D volatilita).
        </p>
      </div>

      {/* EXECUTION PLAN */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Exekučný plán</h2>
          <div className="flex gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground">Market 60%</span>
            <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground">Limit 40% · −{plan.limitDiscountPct}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-secondary/60 rounded-lg p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Market</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{formatUsd(plan.marketUsd)}</p>
          </div>
          <div className="bg-secondary/60 rounded-lg p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Limit (−{plan.limitDiscountPct}%)</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{formatUsd(plan.limitUsd)}</p>
          </div>
        </div>

        <div className="space-y-3">
          {plan.perAsset.map(a => (
            <div key={a.symbol} className="bg-secondary/40 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: a.color + '20', color: a.color }}
                  >
                    {a.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{a.symbol}</p>
                    <p className="text-[10px] text-muted-foreground">{Math.round(a.weight * 100)}%</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  {formatUsd(a.marketUsd + a.limitUsd)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-background/40 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Market</p>
                  <p className="font-semibold text-foreground tabular-nums">{formatUsd(a.marketUsd)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {a.currentPrice > 0 ? `${formatQuantity(a.marketQty, a.symbol)} ${a.symbol}` : '—'}
                  </p>
                </div>
                <div className="bg-background/40 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Limit −{a.limitDiscountPct}%</p>
                  <p className="font-semibold text-foreground tabular-nums">{formatUsd(a.limitUsd)}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {a.limitPrice > 0 ? `${formatQuantity(a.limitQty, a.symbol)} ${a.symbol}` : '—'}
                  </p>
                </div>
              </div>

              {a.limitPrice > 0 && (
                <div className="flex items-center justify-between bg-background/40 rounded p-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Limit cena</p>
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatPrice(a.limitPrice)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Aktuálna: {formatPrice(a.currentPrice)}
                    </p>
                  </div>
                  <CopyButton text={a.limitPrice.toFixed(2)} label="Kopírovať" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CHECKLIST */}
      <div className="glass-card p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Pondelkový checklist
        </h2>
        <ol className="space-y-2 text-xs text-foreground">
          {[
            'Skontroluj nevyplnené limit ordery z minulého týždňa → zruš ich',
            `Pripočítaj zrušený limit kapitál k tomuto týždňu (rezerva: ${formatUsd(plan.reservedUsd)})`,
            `Zadaj 3 market ordery (BTC ${formatUsd(plan.perAsset[0].marketUsd)} · ETH ${formatUsd(plan.perAsset[1].marketUsd)} · SOL ${formatUsd(plan.perAsset[2].marketUsd)})`,
            `Zadaj 3 limit ordery (−${plan.limitDiscountPct} % od market ceny)`,
            'Ulož týždeň do histórie tlačidlom nižšie',
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] font-bold">
                {i + 1}
              </span>
              <span className="leading-relaxed pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        <button
          onClick={handleSaveWeek}
          className="mt-4 w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          Uložiť tento týždeň
        </button>
      </div>

      {/* HISTORY — 12 weeks summary + regime + allocation strip */}
      <div className="glass-card p-4">
        <button
          onClick={() => setShowHistory(s => !s)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            História ({history.length})
          </h2>
          {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {/* Regime + allocation strip (always visible — last 12 weeks) */}
        {history.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Posledných 12 týždňov</p>
            <div className="flex gap-1">
              {history.slice(0, 12).reverse().map(h => {
                const r = (h.plan.regime ?? 'sideways') as Regime;
                const rsx = regimeStyle(r);
                const pct = Math.round(h.plan.deploymentPct * 100);
                return (
                  <div key={h.date} className="flex-1 flex flex-col items-center gap-0.5"
                    title={`${h.date} · ${r.toUpperCase()} · ${pct}% · score ${h.plan.valuationScore}`}>
                    <div className="w-full h-10 rounded bg-secondary/40 flex items-end overflow-hidden">
                      <div className={`w-full ${rsx.dot}`} style={{ height: `${pct}%` }} />
                    </div>
                    <span className="text-[8px] text-muted-foreground tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="mt-3 space-y-2">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Zatiaľ žiadne uložené týždne.</p>
            ) : (
              <>
                <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-hide">
                  {history.map(h => {
                    const r = (h.plan.regime ?? 'sideways') as Regime;
                    const rsx = regimeStyle(r);
                    return (
                      <div key={h.date} className="flex items-center justify-between bg-secondary/40 rounded p-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">{h.date}</p>
                          <p className="text-[10px] text-muted-foreground">
                            <span className={`px-1.5 py-0.5 rounded ${rsx.bg} ${rsx.text} mr-1.5`}>{r.toUpperCase()}</span>
                            Score {h.plan.valuationScore} · {bandLabel(h.plan.band)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground tabular-nums">{formatUsd(h.plan.investableUsd)}</p>
                          <p className="text-[10px] text-muted-foreground">{Math.round(h.plan.deploymentPct * 100)}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleExportCsv}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                  <button
                    onClick={handleClearHistory}
                    className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-secondary text-rose-400 text-xs font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* MONDAY RITUAL */}
      {showRitual && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          onClick={() => setShowRitual(false)}
        >
          <div
            className="w-full max-w-md glass-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Pondelkový rituál</h2>
              </div>
              <button onClick={() => setShowRitual(false)} className="p-1 rounded-md hover:bg-secondary">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-lg p-3 ${rs.bg}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Režim</p>
                <p className={`text-base font-bold ${rs.text}`}>{plan.regimeShort}</p>
                <p className="text-[10px] text-muted-foreground">Score {plan.factorScore}/100</p>
              </div>
              <div className={`rounded-lg p-3 ${confStyle.bg}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
                <p className={`text-base font-bold ${confStyle.text}`}>{confStyle.label}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">×{plan.confidenceMultiplier.toFixed(2)}</p>
              </div>
              <div className="rounded-lg p-3 bg-primary/15 border border-primary/30">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nasadiť</p>
                <p className="text-2xl font-bold text-primary tabular-nums">{plan.finalAllocationPct}%</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">{formatUsd(plan.investableUsd)}</p>
              </div>
              <div className="rounded-lg p-3 bg-secondary/60">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Týždeň kapitál</p>
                <p className="text-base font-bold text-foreground tabular-nums">{formatUsd(inputs.capital)}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">rezerva {formatUsd(plan.reservedUsd)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2.5 bg-secondary/40">
                <p className="text-[10px] uppercase text-muted-foreground">Market 60%</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{formatUsd(plan.marketUsd)}</p>
              </div>
              <div className="rounded-lg p-2.5 bg-secondary/40">
                <p className="text-[10px] uppercase text-muted-foreground">Limit 40% −{plan.limitDiscountPct}%</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{formatUsd(plan.limitUsd)}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              {plan.perAsset.map(a => (
                <div key={a.symbol} className="flex items-center justify-between bg-secondary/40 rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: a.color + '20', color: a.color }}
                    >
                      {a.symbol}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{Math.round(a.weight * 100)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatUsd(a.marketUsd + a.limitUsd)}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      M {formatUsd(a.marketUsd)} · L {formatUsd(a.limitUsd)} @ {formatPrice(a.limitPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">{plan.rationale}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-sm text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
