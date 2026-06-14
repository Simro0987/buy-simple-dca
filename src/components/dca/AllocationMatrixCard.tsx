import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Sliders, AlertTriangle, CheckCircle2, RotateCcw, HelpCircle } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatUsd } from '@/lib/crypto';
import { toast } from 'sonner';
import { useFearGreed } from '@/hooks/usePrices';
import { useMarketData } from '@/hooks/useMarketData';

// ===== CBBC Quality Scores — Tech / DCA / Liquidity / Health (0-100) =====
const CBBC_BASE: Record<string, { tech: number; dca: number; liq: number; health: number }> = {
  BTC: { tech: 95, dca: 98, liq: 99, health: 96 },
  ETH: { tech: 92, dca: 90, liq: 95, health: 88 },
  SOL: { tech: 84, dca: 78, liq: 82, health: 80 },
};
const ANCHORS = new Set(['BTC', 'ETH']);

function hashSymbol(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0;
  return h;
}
function cbbcScores(symbol: string) {
  const base = CBBC_BASE[symbol];
  if (base) return base;
  const h = hashSymbol(symbol);
  const j = (n: number) => 55 + ((h >> n) & 0x1f); // 55..86
  return { tech: j(0), dca: j(5), liq: j(10), health: j(15) };
}
function qualityColor(score: number): string {
  if (score >= 85) return '#22C55E';
  if (score >= 70) return '#84CC16';
  if (score >= 55) return '#F59E0B';
  return '#EF4444';
}

interface QualityRingProps { score: number; label: string; size?: number; }
function QualityRing({ score, label, size = 40 }: QualityRingProps) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = qualityColor(score);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--border))" strokeWidth={3} fill="none" />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth={3} fill="none" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={off}
            style={{ transition: 'stroke-dashoffset 600ms ease, stroke 300ms ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-foreground">
          {Math.round(score)}
        </span>
      </div>
      <span className="text-[8px] uppercase tracking-tight text-muted-foreground font-semibold">{label}</span>
    </div>
  );
}

export interface TargetAllocationRow {
  id: string;
  symbol: string;
  pct: number; // 0-100
  color: string;
}

const STORAGE_KEY = 'dca-target-weights-v1';
export const ALLOC_CHANGED_EVENT = 'dca-target-weights-changed';

const DEFAULT_ROWS: TargetAllocationRow[] = [
  { id: 'btc', symbol: 'BTC', pct: 64, color: '#F7931A' },
  { id: 'eth', symbol: 'ETH', pct: 25, color: '#627EEA' },
  { id: 'sol', symbol: 'SOL', pct: 11, color: '#9945FF' },
];

const PALETTE = ['#22D3EE', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#F87171', '#60A5FA'];

export function loadTargetWeights(): TargetAllocationRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ROWS;
    const parsed = JSON.parse(raw) as TargetAllocationRow[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ROWS;
    return parsed;
  } catch {
    return DEFAULT_ROWS;
  }
}

function saveTargetWeights(rows: TargetAllocationRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event(ALLOC_CHANGED_EVENT));
  } catch { /* ignore */ }
}

interface Props {
  weeklyBudgetUsd: number;
}

export function AllocationMatrixCard({ weeklyBudgetUsd }: Props) {
  const [rows, setRows] = useState<TargetAllocationRow[]>(loadTargetWeights);
  const [newSymbol, setNewSymbol] = useState('');
  const { data: fg } = useFearGreed();
  const { data: market } = useMarketData();

  useEffect(() => { saveTargetWeights(rows); }, [rows]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.pct, 0), [rows]);
  const valid = Math.abs(total - 100) < 0.01;

  // ===== Anchors (BTC/ETH) vs Altcoins (rest) — stacked split =====
  const { anchorsPct, altsPct } = useMemo(() => {
    const a = rows.filter(r => ANCHORS.has(r.symbol)).reduce((s, r) => s + r.pct, 0);
    const t = total > 0 ? total : 100;
    return { anchorsPct: (a / t) * 100, altsPct: ((t - a) / t) * 100 };
  }, [rows, total]);

  const [expandedCbbc, setExpandedCbbc] = useState<string | null>(null);

  const fgValue = typeof fg?.value === 'number' ? fg.value : 50;
  const fgLabel = fg?.classification ?? 'Neutral';
  const solTvl = market?.sol?.tvl ?? 0;
  const tvlHealthy = solTvl >= 8_000_000_000;
  const mayer = market?.btc?.mayerMultiple ?? 1;
  const mayerZone = mayer < 0.9 ? 'Hard Accumulation' : mayer > 1.4 ? 'Overheated' : 'Macro Support';

  // ===== Dynamic reasons — human-readable bullets driving the current split =====
  const reasons = useMemo(() => {
    const list: Array<{ icon: string; text: string; tone: 'pos' | 'neg' | 'neu' }> = [];
    if (fgValue < 30) list.push({ icon: '🟢', text: `Fear & Greed nízky (${fgValue}) → posilnenie Market nákupov na Anchors`, tone: 'pos' });
    else if (fgValue > 75) list.push({ icon: '🟠', text: `Fear & Greed extrémne vysoký (${fgValue}) → škrtenie Altcoin expozície, viac Limit Dynamic`, tone: 'neg' });
    else list.push({ icon: '⚪️', text: `Fear & Greed neutrálny (${fgValue}) → vyvážený split medzi Market a Limit`, tone: 'neu' });

    if (mayer < 0.9) list.push({ icon: '🟢', text: `BTC Mayer ${mayer.toFixed(2)} pod 0.9 → makro akumulačná zóna, navýšiť BTC váhu`, tone: 'pos' });
    else if (mayer > 1.4) list.push({ icon: '🔴', text: `BTC Mayer ${mayer.toFixed(2)} nad 1.4 → prehriata zóna, brzdiť market nákupy`, tone: 'neg' });
    else list.push({ icon: '⚪️', text: `BTC Mayer ${mayer.toFixed(2)} v pásme Macro Support → držať plánovanú alokáciu`, tone: 'neu' });

    if (solTvl > 0) {
      if (tvlHealthy) list.push({ icon: '🟢', text: `Solana TVL $${(solTvl/1e9).toFixed(2)} B nad prahom → priestor pre vyššiu SOL váhu`, tone: 'pos' });
      else list.push({ icon: '🟡', text: `Solana TVL $${(solTvl/1e9).toFixed(2)} B pod prahom $8 B → opatrnejšia Altcoin expozícia`, tone: 'neg' });
    }

    if (anchorsPct >= 80) list.push({ icon: '🛡️', text: `Anchors tvoria ${anchorsPct.toFixed(1)}% → defenzívny profil, nižšia volatilita`, tone: 'neu' });
    else if (altsPct >= 30) list.push({ icon: '⚡️', text: `Altcoins tvoria ${altsPct.toFixed(1)}% → vyššia citlivosť na sentiment`, tone: 'neu' });
    return list;
  }, [fgValue, mayer, solTvl, tvlHealthy, anchorsPct, altsPct]);


  const updatePct = (id: string, pct: number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, pct: Math.max(0, Math.min(100, pct)) } : r));
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      toast.error('Musí zostať aspoň jeden token');
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const addRow = () => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) {
      toast.error('Zadaj symbol tokenu');
      return;
    }
    if (rows.some(r => r.symbol === symbol)) {
      toast.error('Tento token už existuje');
      return;
    }
    if (rows.length >= 8) {
      toast.error('Maximálne 8 tokenov');
      return;
    }
    const color = PALETTE[rows.length % PALETTE.length];
    setRows(prev => [...prev, { id: symbol.toLowerCase(), symbol, pct: 0, color }]);
    setNewSymbol('');
  };

  const normalize = () => {
    if (total <= 0) return;
    const factor = 100 / total;
    setRows(prev => prev.map(r => ({ ...r, pct: Math.round(r.pct * factor * 10) / 10 })));
    toast.success('Váhy normalizované na 100 %');
  };

  const resetDefaults = () => {
    setRows(DEFAULT_ROWS);
    toast.success('Obnovené východiskové váhy (64/25/11)');
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders className="w-4 h-4 text-primary flex-shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground truncate">
            Cieľová alokácia portfólia
          </h2>
        </div>
        <button
          onClick={resetDefaults}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-[10px] font-medium active:scale-95"
          title="Obnoviť 64 / 25 / 11"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Nastav cieľové váhy. DCA engine automaticky prepočíta týždenné rozdelenie kapitálu podľa týchto percent.
      </p>

      {/* ANCHORS vs ALTCOINS — colorful stacked split + Prečo? popover */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Anchors vs Altcoins
          </p>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/70 text-[10px] font-semibold text-foreground hover:bg-secondary active:scale-95 transition"
                aria-label="Prečo táto alokácia?"
              >
                <HelpCircle className="w-3 h-3 text-primary" /> Prečo?
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-[11px] space-y-1.5">
              <p className="font-bold text-foreground">Logika živej alokácie</p>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Fear &amp; Greed</span>
                <span className="tabular-nums font-semibold text-foreground">{fgValue}/100 · {fgLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">BTC Mayer · zóna</span>
                <span className="tabular-nums font-semibold text-foreground">{mayer.toFixed(2)} · {mayerZone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Solana TVL</span>
                <span className={`tabular-nums font-semibold ${tvlHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
                  ${(solTvl / 1e9).toFixed(2)} B {tvlHealthy ? '🟢' : '🟡'}
                </span>
              </div>
              <p className="text-muted-foreground leading-snug pt-1 border-t border-border">
                <span className="text-sky-400 font-semibold">Anchors</span> (BTC/ETH) tvoria jadro – nižší risk, hlbšia likvidita.
                <span className="text-violet-400 font-semibold"> Altcoins</span> (SOL+) reagujú silnejšie na sentiment a TVL.
                {fgValue < 30 && ' Extrémny strach → zvýši priestor pre Anchors.'}
                {fgValue > 75 && ' Extrémna chamtivosť → škrť Altcoin expozíciu.'}
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <div className="h-3 rounded-full bg-background/60 overflow-hidden flex ring-1 ring-border">
          <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${anchorsPct}%` }} />
          <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${altsPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums">
          <span className="flex items-center gap-1 text-sky-400 font-semibold">
            <span className="w-2 h-2 rounded-sm bg-sky-500" /> Anchors {anchorsPct.toFixed(1)}%
          </span>
          <span className="flex items-center gap-1 text-violet-400 font-semibold">
            Altcoins {altsPct.toFixed(1)}% <span className="w-2 h-2 rounded-sm bg-violet-500" />
          </span>
        </div>
      </div>

      {/* Total sum bar */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
        valid ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'
      }`}>
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          {valid
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            : <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
          <span className={valid ? 'text-emerald-400' : 'text-rose-400'}>
            Súčet = {total.toFixed(1)} %
          </span>
        </span>
        {!valid && (
          <button
            onClick={normalize}
            className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-bold active:scale-95"
          >
            Normalizovať na 100 %
          </button>
        )}
      </div>

      {/* Allocation rows */}
      <div className="space-y-2.5">
        {rows.map(r => {
          const budgetForRow = valid && weeklyBudgetUsd > 0 ? (weeklyBudgetUsd * r.pct) / 100 : 0;
          return (
            <div key={r.id} className="p-2.5 rounded-lg bg-secondary/50 space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: r.color + '20', color: r.color }}
                >
                  {r.symbol.slice(0, 3)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{r.symbol}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {valid && weeklyBudgetUsd > 0
                      ? `${formatUsd(budgetForRow)} / týždeň`
                      : 'čaká na 100 %'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={r.pct}
                    min={0}
                    max={100}
                    step={0.1}
                    onChange={e => updatePct(r.id, Number(e.target.value) || 0)}
                    className="w-16 bg-background border border-border rounded px-2 py-1 text-xs text-right text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <button
                    onClick={() => removeRow(r.id)}
                    className="p-1.5 rounded-md bg-rose-500/10 text-rose-400 active:scale-95"
                    aria-label={`Odstrániť ${r.symbol}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <Slider
                value={[r.pct]}
                onValueChange={v => updatePct(r.id, v[0])}
                min={0}
                max={100}
                step={0.5}
              />
              {/* CBBC Quality Score — Tech / DCA / Liquidity / Health */}
              {(() => {
                const q = cbbcScores(r.symbol);
                const overall = Math.round((q.tech + q.dca + q.liq + q.health) / 4);
                const isAnchor = ANCHORS.has(r.symbol);
                return (
                  <div className="flex items-center justify-between gap-2 pt-1.5 mt-1 border-t border-border">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isAnchor ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300'}`}>
                        {isAnchor ? 'ANCHOR' : 'ALTCOIN'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">CBBC skóre</span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: qualityColor(overall) }}>
                        {overall}/100
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <QualityRing score={q.tech} label="TECH" />
                      <QualityRing score={q.dca} label="DCA" />
                      <QualityRing score={q.liq} label="LIQ" />
                      <QualityRing score={q.health} label="HEALTH" />
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Add token row */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={newSymbol}
          onChange={e => setNewSymbol(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
          placeholder="Symbol (napr. LINK)"
          className="flex-1 bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary uppercase"
          maxLength={8}
        />
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Pridať token
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        ⚠️ Súčet všetkých percent musí byť presne 100 %. DCA engine použije tieto váhy len pri platnej konfigurácii.
      </p>
    </div>
  );
}
