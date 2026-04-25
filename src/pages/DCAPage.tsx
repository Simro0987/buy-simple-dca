import { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Download, Trash2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { usePrices, useFearGreed } from '@/hooks/usePrices';
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
  type ValuationBand,
} from '@/lib/mondayController';
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

function bandTone(band: ValuationBand): string {
  switch (band) {
    case 'deep_value':   return 'text-emerald-400';
    case 'accumulation': return 'text-emerald-400';
    case 'neutral':      return 'text-foreground';
    case 'expensive':    return 'text-amber-400';
    case 'euphoria':     return 'text-rose-400';
  }
}

// Monotonic: cheap (low) = green, expensive (high) = red
function scoreColor(score: number): string {
  if (score <= 25) return 'text-emerald-400';
  if (score <= 45) return 'text-emerald-400';
  if (score <= 65) return 'text-foreground';
  if (score <= 80) return 'text-amber-400';
  return 'text-rose-400';
}

function regimeStyle(band: ValuationBand): { bg: string; text: string; dot: string } {
  switch (band) {
    case 'deep_value':
    case 'accumulation': return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' };
    case 'neutral':      return { bg: 'bg-secondary',      text: 'text-foreground',  dot: 'bg-foreground/50' };
    case 'expensive':    return { bg: 'bg-amber-500/15',   text: 'text-amber-400',   dot: 'bg-amber-400' };
    case 'euphoria':     return { bg: 'bg-rose-500/15',    text: 'text-rose-400',    dot: 'bg-rose-400' };
  }
}

export function DCAPage({ lang: _lang }: Props) {
  const [inputs, setInputs] = useState<MondayInputs>(loadInputs);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [showWhy, setShowWhy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: prices, refetch: refetchPrices, isFetching: pricesLoading } = usePrices();
  const { data: fg, refetch: refetchFg, isFetching: fgLoading } = useFearGreed();

  // Auto-fill from APIs (only if user hasn't manually overridden — empty/zero values)
  useEffect(() => {
    setInputs(prev => {
      const next = { ...prev };
      let changed = false;
      const livePrice = prices?.bitcoin?.usd;
      if (livePrice && (!prev.btcPrice || prev.btcPrice === 0)) {
        next.btcPrice = Math.round(livePrice);
        if (!prev.btc30dHigh || prev.btc30dHigh === 0) {
          // No 30D-high endpoint here → seed with current price; user adjusts manually
          next.btc30dHigh = Math.round(livePrice);
        }
        changed = true;
      }
      if (typeof fg?.value === 'number' && prev.fearGreed === DEFAULTS.fearGreed) {
        next.fearGreed = fg.value;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [prices, fg]);

  // Persist inputs
  useEffect(() => {
    localStorage.setItem(INPUTS_KEY, JSON.stringify(inputs));
  }, [inputs]);

  const plan = useMemo(() => buildPlan(inputs, prices), [inputs, prices]);

  const update = <K extends keyof MondayInputs>(key: K, value: MondayInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: value }));

  const handleAutoFill = async () => {
    const r = await Promise.all([refetchPrices(), refetchFg()]);
    const livePrice = r[0].data?.bitcoin?.usd;
    const liveFg = r[1].data?.value;
    setInputs(prev => ({
      ...prev,
      btcPrice: livePrice ? Math.round(livePrice) : prev.btcPrice,
      fearGreed: typeof liveFg === 'number' ? liveFg : prev.fearGreed,
    }));
    toast.success('Dáta načítané');
  };

  const handleSaveWeek = () => {
    const entry: HistoryEntry = {
      date: thisMondayIso(),
      inputs,
      plan: {
        valuationScore: plan.valuationScore,
        band: plan.band,
        deploymentPct: plan.deploymentPct,
        investableUsd: plan.investableUsd,
        reservedUsd: plan.reservedUsd,
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

  const loading = pricesLoading || fgLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Monday DCA Controller</h1>
          <p className="text-xs text-muted-foreground">Týždenný systém nasadenia kapitálu · {thisMondayIso()}</p>
        </div>
        <button
          onClick={handleAutoFill}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Auto-fill
        </button>
      </div>

      {/* TOP SECTION — Valuation Score + deployment */}
      <div className="glass-card p-5">
        {(() => {
          const rs = regimeStyle(plan.band);
          return (
            <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg mb-4 ${rs.bg}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${rs.dot} animate-pulse`} />
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Trhový režim</p>
                  <p className={`text-sm font-bold tracking-wide ${rs.text}`}>{plan.regimeLabel} · {bandLabel(plan.band)}</p>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Valuation Score</p>
            <p className={`text-5xl font-bold tabular-nums ${scoreColor(plan.valuationScore)}`}>
              {plan.valuationScore}
              <span className="text-xl text-muted-foreground font-normal">/100</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">0 = lacný · 50 = neutrál · 100 = drahý</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nasadiť</p>
            <p className="text-3xl font-bold text-foreground tabular-nums">{Math.round(plan.deploymentPct * 100)}%</p>
            <p className="text-sm font-semibold text-foreground mt-1">{formatUsd(plan.investableUsd)}</p>
          </div>
        </div>

        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              plan.valuationScore <= 25 ? 'bg-emerald-500'
              : plan.valuationScore <= 45 ? 'bg-emerald-500'
              : plan.valuationScore <= 65 ? 'bg-foreground/40'
              : plan.valuationScore <= 80 ? 'bg-amber-500'
              : 'bg-rose-500'
            }`}
            style={{ width: `${plan.valuationScore}%` }}
          />
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
            <p className="text-xs text-muted-foreground leading-relaxed">
              {plan.rationale}
            </p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Mapovanie: 0–25 → 75 % · 26–45 → 60 % · 46–65 → 50 % · 66–80 → 40 % · 81–100 → 25 %.
              Vyššie skóre = drahší trh = nižšia alokácia.
            </p>
          </div>
        )}
      </div>

      {/* INPUTS */}
      <div className="glass-card p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vstupy (manuálny override)</h2>
        <NumberInput label="Týždenný kapitál (USD)" value={inputs.capital} onChange={v => update('capital', v)} step={50} />
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="BTC cena" value={inputs.btcPrice} onChange={v => update('btcPrice', v)} step={100} />
          <NumberInput label="BTC 30D high" value={inputs.btc30dHigh} onChange={v => update('btc30dHigh', v)} step={100} />
        </div>
        <NumberInput label="Fear & Greed (0–100)" value={inputs.fearGreed} onChange={v => update('fearGreed', Math.max(0, Math.min(100, v)))} step={1} />
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">BTC vs 200D MA</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: true, label: 'Nad 200D MA' },
              { v: false, label: 'Pod 200D MA' },
            ].map(opt => (
              <button
                key={String(opt.v)}
                onClick={() => update('btcAbove200dMA', opt.v)}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  inputs.btcAbove200dMA === opt.v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MIDDLE — Execution breakdown */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Exekúcia</h2>
          <div className="flex gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground">Market 60%</span>
            <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground">Limit 40%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-secondary/60 rounded-lg p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Market</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{formatUsd(plan.marketUsd)}</p>
          </div>
          <div className="bg-secondary/60 rounded-lg p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Limit (-3 až -5%)</p>
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
                  <p className="text-[10px] text-muted-foreground">Limit -{a.limitDiscountPct}%</p>
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

      {/* BOTTOM — Monday checklist */}
      <div className="glass-card p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Pondelkový checklist
        </h2>
        <ol className="space-y-2 text-xs text-foreground">
          {[
            'Skontroluj nevyplnené limit ordery z minulého týždňa → zruš ich',
            `Pripočítaj zrušený limit kapitál k tohtotýždňovému (rezerva: ${formatUsd(plan.reservedUsd)})`,
            `Zadaj 3 market ordery (BTC ${formatUsd(plan.perAsset[0].marketUsd)} · ETH ${formatUsd(plan.perAsset[1].marketUsd)} · SOL ${formatUsd(plan.perAsset[2].marketUsd)})`,
            'Zadaj 3 limit ordery na vypočítané ceny (-3 až -5%)',
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

      {/* HISTORY */}
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

        {showHistory && (
          <div className="mt-3 space-y-2">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Zatiaľ žiadne uložené týždne.</p>
            ) : (
              <>
                <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-hide">
                  {history.map(h => (
                    <div key={h.date} className="flex items-center justify-between bg-secondary/40 rounded p-2 text-xs">
                      <div>
                        <p className="font-semibold text-foreground">{h.date}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Score {h.plan.valuationScore} · {bandLabel(h.plan.band)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground tabular-nums">{formatUsd(h.plan.investableUsd)}</p>
                        <p className="text-[10px] text-muted-foreground">{Math.round(h.plan.deploymentPct * 100)}%</p>
                      </div>
                    </div>
                  ))}
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
    </div>
  );
}

function NumberInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
      <input
        type="number"
        value={value || ''}
        onChange={e => onChange(Number(e.target.value) || 0)}
        step={step}
        className="w-full bg-secondary text-foreground text-base font-semibold tabular-nums rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
